/* GAP Permit Tracker — Google Sheets service.
 * Copy into a new Google Apps Script project, run setupGap once, then deploy.
 * GitHub Pages serves the interface; this service keeps records in Sheets.
 * Browser keys are random, stored only as hashes here, and require approval.
 * Roles always come from the Devices sheet, never from a browser request.
 */
var GAP_COLUMNS_ = {
  Permits: ['id','plant','unit','orderNo','orderType','jobDescription','receiver','contactNo','section','shiftDate','shift','isOnline','isolationTime','issueTime','extendedTime','returnedTime','status','issuer','createdBy','updatedBy','createdAt','updatedAt','version','deletedAt','operationId','sapDetails','applicantDetails'],
  Requests: ['id','targetPermitId','requestType','payload','requestedBy','requestedName','requestedAt','reviewedBy','reviewedAt','decision','version','operationId'],
  Members: ['email','name','role','updatedAt'],
  Devices: ['id','tokenHash','email','name','role','status','createdAt','updatedAt','employeeId','phone','requestedRole'],
  AuditLog: ['id','at','actor','action','recordId','before','after','operationId']
};

function setupGap() {
  var properties=PropertiesService.getScriptProperties();
  var id=properties.getProperty('GAP_SPREADSHEET_ID');
  var book=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('GAP Permit Register — Green Anode Plant');
  properties.setProperty('GAP_SPREADSHEET_ID',book.getId());
  if(!properties.getProperty('GAP_API_SECRET'))properties.setProperty('GAP_API_SECRET',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  if(!properties.getProperty('GAP_UNITS'))properties.setProperty('GAP_UNITS','["GAP"]');
  if(!properties.getProperty('GAP_OWNER_CLAIMED')&&!properties.getProperty('GAP_OWNER_SETUP_KEY'))properties.setProperty('GAP_OWNER_SETUP_KEY',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  if(!properties.getProperty('GAP_JOIN_CODE'))properties.setProperty('GAP_JOIN_CODE',Utilities.getUuid().replace(/-/g,'').slice(0,16));
  book.setSpreadsheetTimeZone('Asia/Kolkata');
  Object.keys(GAP_COLUMNS_).forEach(function(name){
    var sheet=book.getSheetByName(name)||book.insertSheet(name);
    if(sheet.getLastRow()===0){sheet.getRange(1,1,1,GAP_COLUMNS_[name].length).setValues([GAP_COLUMNS_[name]]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,GAP_COLUMNS_[name].length).setBackground('#172c43').setFontColor('#ffffff').setFontWeight('bold');}
    extendColumns_(sheet,GAP_COLUMNS_[name]);
    var actual=sheet.getRange(1,1,1,GAP_COLUMNS_[name].length).getValues()[0];
    if(JSON.stringify(actual)!==JSON.stringify(GAP_COLUMNS_[name]))throw new Error(name+' has unexpected columns. Do not overwrite an existing register.');
  });
  var email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(!email)throw new Error('The Google account email is unavailable. Add your tracker sign-in email to Members as admin before connecting.');
  properties.setProperty('GAP_OWNER_EMAIL',email);
  var admins=readRows_(book,'Members').filter(function(m){return m.role==='admin';});
  if(!admins.length)append_(book,'Members',{email:email,name:'GAP administrator',role:'admin',updatedAt:new Date().toISOString()});
  SpreadsheetApp.flush();
  console.log('GAP register created: '+book.getUrl());
  console.log('Use GAP_OWNER_SETUP_KEY from Script Properties once in the tracker to approve the owner browser. Never put it in GitHub or chat.');
  return {spreadsheetUrl:book.getUrl(),message:'Setup complete. Keep the spreadsheet private and add authorized staff in Members.'};
}

/** Validate every header before appending new columns. Existing values stay in place. */
function extendColumns_(sheet,columns,dryRun){
  var width=sheet.getLastColumn(),actual=width?sheet.getRange(1,1,1,width).getValues()[0]:[];
  while(actual.length&&actual[actual.length-1]==='')actual.pop();
  if(actual.length>columns.length||actual.some(function(value,i){return value!==columns[i];}))throw new Error(sheet.getName()+' has unexpected columns. No migration was applied.');
  if(!dryRun&&actual.length<columns.length){
    if(sheet.getMaxColumns()<columns.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),columns.length-sheet.getMaxColumns());
    sheet.getRange(1,actual.length+1,1,columns.length-actual.length).setValues([columns.slice(actual.length)]).setBackground('#172c43').setFontColor('#ffffff').setFontWeight('bold');
  }
}
function migrateGapSchema(){
  var lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    var id=PropertiesService.getScriptProperties().getProperty('GAP_SPREADSHEET_ID');
    if(!id)throw new Error('GAP_SPREADSHEET_ID is not configured.');
    var book=SpreadsheetApp.openById(id);
    Object.keys(GAP_COLUMNS_).forEach(function(name){var sheet=book.getSheetByName(name);if(!sheet)throw new Error(name+' tab is missing.');extendColumns_(sheet,GAP_COLUMNS_[name],true);});
    Object.keys(GAP_COLUMNS_).forEach(function(name){extendColumns_(book.getSheetByName(name),GAP_COLUMNS_[name]);});
    SpreadsheetApp.flush();return {schemaVersion:3,message:'Applicant and browser profile columns added. Existing records preserved.'};
  }finally{lock.releaseLock();}
}

function doGet(){return output_({ok:true,service:'GAP Permit Tracker',message:'Signed server requests are required. No permit records are available through this address.'});}

function doPost(event){
  var lock=null;
  try{
    var raw=event&&event.postData&&event.postData.contents;
    if(!raw||raw.length>100000)fail_('BAD_REQUEST','Missing or oversized request.');
    var input=JSON.parse(raw),body=input.body||{},properties=PropertiesService.getScriptProperties();
    var token=String(input.deviceToken||'');
    if(!/^[a-f0-9]{64}$/.test(token))fail_('FORBIDDEN','A valid browser access key is required.');
    var id=properties.getProperty('GAP_SPREADSHEET_ID');if(!id)fail_('CONFIGURATION','Run setupGap before connecting the tracker.');
    lock=LockService.getScriptLock();if(!lock.tryLock(25000))fail_('BUSY','The sheet is busy. Please try again.');
    var book=SpreadsheetApp.openById(id),hash=deviceHash_(token),devices=readRows_(book,'Devices');
    var device=devices.find(function(d){return d.tokenHash===hash;});
    var result;
    if(input.action==='deviceStatus')result=deviceStatus_(device);
    else if(input.action==='claimOwner'){
      if(device&&device.status==='active'&&device.role==='admin')result=deviceStatus_(device);
      else{
        var setup=properties.getProperty('GAP_OWNER_SETUP_KEY');
        if(!setup||!equal_(setup,String(body.setupKey||'')))fail_('FORBIDDEN','The owner setup key is incorrect or already used. The Google sheet owner can reset it in Apps Script.');
        var now=new Date().toISOString();
        var owner={id:device?device.id:'device_'+Utilities.getUuid(),tokenHash:hash,email:properties.getProperty('GAP_OWNER_EMAIL'),name:text_(body.name,120)||'GAP owner',role:'admin',status:'active',createdAt:device?device.createdAt:now,updatedAt:now};
        if(device)replace_(book,'Devices',device._row,owner);else append_(book,'Devices',owner);
        properties.deleteProperty('GAP_OWNER_SETUP_KEY');properties.setProperty('GAP_OWNER_CLAIMED','true');
        audit_(book,{email:owner.email},'claim_owner',owner.id,null,publicDevice_(owner),'owner_'+owner.id);
        result=deviceStatus_(owner);
      }
    }else if(input.action==='requestDevice'){
      if(device)result=deviceStatus_(device);
      else{
        if(!equal_(String(properties.getProperty('GAP_JOIN_CODE')||''),String(body.joinCode||''))||!body.joinCode)fail_('FORBIDDEN','Ask your plant administrator for the plant access code.');
        var email=text_(body.email,200).toLowerCase(),name=text_(body.name,120);
        if(!name||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))fail_('VALIDATION','Enter your name and a valid email if provided.');
        var phone=text_(body.phone,30).replace(/[\s()-]/g,'');if(phone&&!/^\+?\d{7,15}$/.test(phone))fail_('VALIDATION','Phone must have 7–15 digits.');
        if(devices.filter(function(d){return d.status==='pending';}).length>=200)fail_('LIMIT','The pending-browser list is full. Ask an administrator to review it.');
        var time=new Date().toISOString(),pending={id:'device_'+Utilities.getUuid(),tokenHash:hash,email:email,name:name,role:'requester',status:'pending',createdAt:time,updatedAt:time,employeeId:text_(body.employeeId,80),phone:phone,requestedRole:body.requestedRole==='issuer'?'issuer':'requester'};
        append_(book,'Devices',pending);result=deviceStatus_(pending);
      }
    }else{
      if(!device||device.status!=='active'||['admin','issuer','requester'].indexOf(device.role)<0)fail_('FORBIDDEN','This browser is not approved. Request plant access or ask an administrator to approve it.');
      var actor={id:device.id,email:device.email||device.id,name:device.name,role:device.role};
      result=dispatch_(book,actor,input.action,body,properties);
    }
    SpreadsheetApp.flush();return output_(Object.assign({ok:true},result));
  }catch(error){return output_({ok:false,error:error.gapCode?error.message:'The sheet service could not complete this request. Check the Apps Script execution log.',code:error.gapCode||'SERVICE_ERROR'});}
  finally{if(lock)lock.releaseLock();}
}
function deviceHash_(token){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function publicDevice_(device){var d=clean_(device);delete d.tokenHash;return d;}
function deviceStatus_(device){return {active:!!device&&device.status==='active',status:device?device.status:'unknown',role:device&&device.status==='active'?device.role:'requester',user:device?{name:device.name,email:device.email,employeeId:device.employeeId||'',phone:device.phone||''}:null};}
function resetOwnerSetup(){var p=PropertiesService.getScriptProperties();p.setProperty('GAP_OWNER_SETUP_KEY',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));console.log('A fresh owner setup key is ready in Script Properties. Existing approved browsers remain approved.');}

function dispatch_(book,actor,action,body,properties){
  if(['save','request','approve','reject','archive','setMember'].indexOf(action)>=0)operation_(body);
  var units=JSON.parse(properties.getProperty('GAP_UNITS')||'["GAP"]');
  if(!Array.isArray(units)||!units.length)fail_('CONFIGURATION','GAP_UNITS must be a non-empty JSON list of unit names.');
  if(action==='bootstrap')return {role:actor.role,units:units,schemaVersion:schemaVersion_(book),spreadsheetUrl:actor.role==='admin'?book.getUrl():'',joinCode:actor.role==='admin'?properties.getProperty('GAP_JOIN_CODE'):''};
  if(action==='list'){
    var from=validDate_(body.from),to=validDate_(body.to);
    if(from>to||(Date.parse(to)-Date.parse(from))/86400000>366)fail_('VALIDATION','Choose a date range of no more than one year.');
    var rows=readRows_(book,'Permits').map(permit_).filter(function(p){return !p.deletedAt&&p.shiftDate>=from&&p.shiftDate<=to;});
    if(rows.length>10000)fail_('LIMIT','This range has more than 10,000 records. Choose a smaller window.');
    var requests=readRows_(book,'Requests').filter(function(r){return r.decision==='pending'&&(actor.role!=='requester'||r.requestedBy===actor.email);}).map(request_).filter(function(r){return r.payload.shiftDate>=from&&r.payload.shiftDate<=to;});
    return {permits:rows,requests:requests};
  }
  if(action==='history'){
    var query=String(body.orderNo||'').trim();if(!/^\d{3,9}$/.test(query))fail_('VALIDATION','Enter 3–9 digits of the order number.');
    var history=readRows_(book,'Permits').map(permit_).filter(function(p){return !p.deletedAt&&p.orderNo.indexOf(query)>=0;});
    if(history.length>1000)fail_('LIMIT','More than 1,000 records match. Enter more digits of the order number.');
    return {permits:history};
  }
  if(action==='devices'){requireRole_(actor,['admin']);return {devices:readRows_(book,'Devices').map(publicDevice_)};}
  if(action==='setDevice'){
    requireRole_(actor,['admin']);operation_(body);
    var devices=readRows_(book,'Devices'),device=devices.find(function(d){return d.id===String(body.id);});
    if(!device)fail_('NOT_FOUND','This browser was not found.');
    if(['admin','issuer','requester'].indexOf(body.role)<0||['active','revoked'].indexOf(body.status)<0)fail_('VALIDATION','Choose a valid browser role and access state.');
    if(device.status==='active'&&device.role==='admin'&&(body.status!=='active'||body.role!=='admin')&&devices.filter(function(d){return d.role==='admin'&&d.status==='active';}).length<2)fail_('VALIDATION','Keep at least one approved administrator browser.');
    var beforeDevice=publicDevice_(device);device.role=body.role;device.status=body.status;device.updatedAt=new Date().toISOString();
    replace_(book,'Devices',device._row,device);audit_(book,actor,'device_access',device.id,beforeDevice,publicDevice_(device),operation_(body));return {};
  }
  if(action==='members'){requireRole_(actor,['admin']);return {members:readRows_(book,'Members').map(clean_)};}
  if(action==='setMember'){
    requireRole_(actor,['admin']);var email=String(body.email||'').trim().toLowerCase(),role=String(body.role||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||['requester','issuer','admin'].indexOf(role)<0)fail_('VALIDATION','Enter a valid email and role.');
    var members=readRows_(book,'Members'),oldMember=members.find(function(m){return m.email===email;});
    if(oldMember&&oldMember.role==='admin'&&role!=='admin'&&members.filter(function(m){return m.role==='admin';}).length<2)fail_('VALIDATION','Keep at least one plant administrator.');
    var nextMember={email:email,name:text_(body.name,120),role:role,updatedAt:new Date().toISOString()};
    if(oldMember)replace_(book,'Members',oldMember._row,nextMember);else append_(book,'Members',nextMember);
    audit_(book,actor,'member_role',email,oldMember||null,nextMember,operation_(body));return {};
  }
  if(action==='save'){
    requireRole_(actor,['issuer','admin']);return {permit:savePermit_(book,actor,body.permit,operation_(body),units)};
  }
  if(action==='request'){
    var operationId=operation_(body),allRequests=readRows_(book,'Requests');
    var retry=allRequests.find(function(r){return r.operationId===operationId&&r.requestedBy===actor.email;});if(retry)return {request:request_(retry)};
    var input=validatePermit_(body.permit,units),rows=readRows_(book,'Permits').map(permit_),old=input.id?rows.find(function(p){return p.id===input.id&&!p.deletedAt;}):null;
    if(input.id&&(!old||old.version!==Number(input.version)))fail_('CONFLICT','This permit has changed. Refresh and submit your request again.');
    checkDuplicate_(rows,input,input.id);
    if(allRequests.some(function(r){if(r.decision!=='pending'||r.requestType!=='new')return false;var p=JSON.parse(r.payload);return sameEntry_(p,input);})&&!old)fail_('DUPLICATE','A request for this order, unit and shift is already waiting for approval.');
    var req={id:'req_'+Utilities.getUuid(),targetPermitId:old?old.id:'',requestType:old?'update':'new',payload:JSON.stringify(input),requestedBy:actor.email,requestedName:actor.name,requestedAt:new Date().toISOString(),reviewedBy:'',reviewedAt:'',decision:'pending',version:1,operationId:operationId};
    append_(book,'Requests',req);audit_(book,actor,'request',req.id,null,req,operationId);return {request:request_(req)};
  }
  if(action==='approve'||action==='reject'){
    requireRole_(actor,['issuer','admin']);
    var reqs=readRows_(book,'Requests'),request=reqs.find(function(r){return r.id===String(body.id);});
    if(!request)fail_('NOT_FOUND','This request was not found. Refresh the requests list.');
    if(request.decision===action+'d'||(action==='approve'&&request.decision==='approved')||(action==='reject'&&request.decision==='rejected'))return {};
    if(request.decision!=='pending'||Number(request.version)!==Number(body.version))fail_('CONFLICT','This request has already changed. Refresh before reviewing it.');
    var before=clean_(request),approved=null;
    if(action==='approve'){
      var original=JSON.parse(request.payload),edited=Object.assign({},body.permit||original);
      edited.id=request.targetPermitId||'';edited.version=original.version;
      approved=savePermit_(book,actor,edited,'approve_'+request.id,units,request.targetPermitId?null:'permit_'+request.id);
    }
    request.decision=action==='approve'?'approved':'rejected';request.reviewedBy=actor.email;request.reviewedAt=new Date().toISOString();request.version=Number(request.version)+1;
    replace_(book,'Requests',request._row,request);audit_(book,actor,action,request.id,before,request,operation_(body));return approved?{permit:approved}:{};
  }
  if(action==='archive'){
    requireRole_(actor,['issuer','admin']);var all=readRows_(book,'Permits'),row=all.find(function(p){return p.id===String(body.id);});
    if(!row)fail_('NOT_FOUND','This permit was not found.');
    if(row.deletedAt)return {};
    if(Number(row.version)!==Number(body.version))fail_('CONFLICT','This permit has changed. Refresh before archiving it.');
    var beforeArchive=permit_(row);row.deletedAt=new Date().toISOString();row.updatedAt=row.deletedAt;row.updatedBy=actor.email;row.version=Number(row.version)+1;row.operationId=operation_(body);
    replace_(book,'Permits',row._row,row);audit_(book,actor,'archive',row.id,beforeArchive,row,row.operationId);return {};
  }
  fail_('BAD_REQUEST','This action is not supported.');
}

function savePermit_(book,actor,raw,operationId,units,forcedId){
  var input=validatePermit_(raw,units),all=readRows_(book,'Permits'),rows=all.map(permit_);
  var retry=rows.find(function(p){return p.operationId===operationId&&p.updatedBy===actor.email;});if(retry)return retry;
  var old=input.id?all.find(function(p){return p.id===input.id&&!p.deletedAt;}):null;
  if(input.id&&(!old||Number(old.version)!==Number(input.version)))fail_('CONFLICT','This permit was changed by someone else. Refresh, reopen it, and apply your changes to the latest version.');
  var recovered=forcedId?rows.find(function(p){return p.id===forcedId;}):null;
  if(recovered){if(recovered.operationId===operationId)return recovered;fail_('CONFLICT','The approved permit already exists. Refresh the register.');}
  checkDuplicate_(rows,input,input.id);
  var now=new Date().toISOString(),record=Object.assign({},input,{id:old?old.id:forcedId||'permit_'+Utilities.getUuid(),plant:'GAP',orderType:classify_(input.orderNo),issuer:input.issuer||actor.name,createdBy:old?old.createdBy:actor.email,updatedBy:actor.email,createdAt:old?old.createdAt:now,updatedAt:now,version:old?Number(old.version)+1:1,deletedAt:'',operationId:operationId});
  if(old)replace_(book,'Permits',old._row,record);else append_(book,'Permits',record);
  audit_(book,actor,old?'update':'create',record.id,old?permit_(old):null,record,operationId);return permit_(record);
}

function validatePermit_(raw,units){
  if(!raw||typeof raw!=='object')fail_('VALIDATION','Permit details are missing.');
  var p={id:text_(raw.id,100),version:Number(raw.version)||0,unit:text_(raw.unit,80),orderNo:text_(raw.orderNo,20),jobDescription:text_(raw.jobDescription,2000),receiver:text_(raw.receiver,120),contactNo:text_(raw.contactNo,30).replace(/[\s()-]/g,''),section:text_(raw.section,30),shiftDate:validDate_(raw.shiftDate),shift:text_(raw.shift,1),isOnline:raw.isOnline===true,isolationTime:text_(raw.isolationTime,5),issueTime:text_(raw.issueTime,5),extendedTime:text_(raw.extendedTime,5),returnedTime:text_(raw.returnedTime,5),status:text_(raw.status,15),issuer:text_(raw.issuer,120),sapDetails:raw.sapDetails?validateSapDetails_(raw.sapDetails):null,applicantDetails:raw.applicantDetails?validateApplicant_(raw.applicantDetails):null};
  if(!classify_(p.orderNo))fail_('VALIDATION','Use a valid MA, M1–M4 or SAP permit number.');
  if(p.sapDetails&&schemaVersion_(SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('GAP_SPREADSHEET_ID')))<2)fail_('SCHEMA_UPGRADE','Run migrateGapSchema and deploy the updated Google service before saving SAP permit details.');
  if(!p.jobDescription||!p.receiver)fail_('VALIDATION','Job description and receiver are required.');
  if(['Mechanical','Electrical','Operation'].indexOf(p.section)<0||units.indexOf(p.unit)<0)fail_('VALIDATION','Choose a configured unit and section.');
  if(['A','B','C','G'].indexOf(p.shift)<0)fail_('VALIDATION','Choose a valid shift.');
  if(p.contactNo&&!/^\+?\d{7,15}$/.test(p.contactNo))fail_('VALIDATION','Contact number must have 7–15 digits and an optional + prefix.');
  if(['pending','isolated','issued','extended','returned'].indexOf(p.status)<0)fail_('VALIDATION','Choose a valid permit status.');
  if(p.isOnline)p.isolationTime='';
  [p.isolationTime,p.issueTime,p.extendedTime,p.returnedTime].forEach(function(t){if(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))fail_('VALIDATION','Use 24-hour HH:MM times.');});
  if(p.status==='returned'&&!p.returnedTime)fail_('VALIDATION','A returned permit needs a returned time.');
  if(p.status==='extended'&&!p.extendedTime)fail_('VALIDATION','An extended permit needs an extended time.');
  if(p.status!=='returned'&&p.status!=='extended')p.status=p.issueTime?'issued':p.isolationTime?'isolated':'pending';
  var minute=function(t){var pieces=t.split(':').map(Number);return pieces[0]*60+pieces[1]+(p.shift==='C'&&pieces[0]<6?1440:0);};
  if(p.isolationTime&&p.issueTime&&minute(p.isolationTime)>minute(p.issueTime))fail_('VALIDATION','Issue time must follow isolation time.');
  if(p.issueTime&&p.returnedTime&&minute(p.issueTime)>minute(p.returnedTime))fail_('VALIDATION','Returned time must follow issue time.');
  return p;
}
function classify_(order){if(/^1\d{7}$/.test(order))return 'MA';if(/^[1-4]\d{8}$/.test(order))return 'M'+order[0];if(/^9\d{8,11}$/.test(order)||/^\d{10,12}$/.test(order))return 'SAP';return '';}
function sameEntry_(a,b){return a.unit===b.unit&&a.orderNo===b.orderNo&&a.shiftDate===b.shiftDate&&a.shift===b.shift;}
function checkDuplicate_(rows,input,exclude){if(rows.some(function(p){return !p.deletedAt&&p.id!==exclude&&sameEntry_(p,input);}))fail_('DUPLICATE','This order already exists in the selected unit, date and shift. Update the existing permit.');}
function requireRole_(actor,roles){if(roles.indexOf(actor.role)<0)fail_('FORBIDDEN','Your plant role does not allow this action.');}
function operation_(body){var id=String(body.operationId||'');if(!/^[a-zA-Z0-9_-]{8,120}$/.test(id))fail_('VALIDATION','The request identifier is missing. Reopen the form and try again.');return id;}
function validDate_(raw){var value=String(raw||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(value))fail_('VALIDATION','Choose a valid date.');var d=new Date(value+'T12:00:00Z');if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)fail_('VALIDATION','Choose a valid calendar date.');return value;}
function text_(value,max){return String(value==null?'':value).trim().slice(0,max);}
function equal_(a,b){if(a.length!==b.length)return false;var mismatch=0;for(var i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
function fail_(code,message){var error=new Error(message);error.gapCode=code;throw error;}
function output_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function clean_(row){var output={};Object.keys(row).forEach(function(key){if(key!=='_row')output[key]=row[key];});return output;}
function permit_(row){var p=clean_(row);p.isOnline=p.isOnline===true||p.isOnline==='TRUE'||p.isOnline==='true';p.version=Number(p.version)||1;['id','orderNo','contactNo','shiftDate','isolationTime','issueTime','extendedTime','returnedTime','deletedAt','createdAt','updatedAt'].forEach(function(key){p[key]=String(p[key]||'');});if(typeof p.sapDetails==='string'&&p.sapDetails){try{p.sapDetails=JSON.parse(p.sapDetails);}catch(error){p.sapDetails=null;}}else if(!p.sapDetails)p.sapDetails=null;if(typeof p.applicantDetails==='string'&&p.applicantDetails){try{p.applicantDetails=JSON.parse(p.applicantDetails);}catch(error){p.applicantDetails=null;}}return p;}
function schemaVersion_(book){var sheet=book.getSheetByName('Permits');if(!sheet)return 1;if(sheet.getRange(1,27).getValue()==='applicantDetails')return 3;return sheet.getRange(1,26).getValue()==='sapDetails'?2:1;}
function validateApplicant_(raw){
  var p={employeeId:text_(raw.employeeId,80),email:text_(raw.email,200).toLowerCase()};
  if(p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))fail_('VALIDATION','Enter a valid applicant email or leave it blank.');return p;
}
function validateSapDetails_(raw){if(!raw||typeof raw!=='object')fail_('VALIDATION','SAP permit details are malformed.');var keys=['permitType','sapPermitNo','sapOrderNo','applicationDate','applicantName','department','locationOfWork','personWorking','toolsEquipment','equipmentName','equipmentNo','certificateRefs','hazards','controls','ppe','safetyProcedureNo','validFromDate','validFromTime','validToDate','validToTime','sapStatus','handoverStatus','issuerName','issuerSigned','issuerDate','issuerTime','receiverName','receiverSigned','receiverDate','receiverTime','checkboxReviewConfirmed'];var limits={permitType:80,sapPermitNo:30,sapOrderNo:30,applicationDate:20,applicantName:120,department:120,locationOfWork:180,personWorking:500,toolsEquipment:1000,equipmentName:150,equipmentNo:80,certificateRefs:1000,hazards:3000,controls:3000,ppe:1000,safetyProcedureNo:250,validFromDate:20,validFromTime:10,validToDate:20,validToTime:10,sapStatus:80,handoverStatus:20,issuerName:120,issuerDate:20,issuerTime:10,receiverName:120,receiverDate:20,receiverTime:10};var out={};keys.forEach(function(key){var value=raw[key];if(key==='issuerSigned'||key==='receiverSigned'||key==='checkboxReviewConfirmed')out[key]=value===true;else if(key==='handoverStatus')out[key]=value==='handed_over'?'handed_over':'pending';else out[key]=text_(value,limits[key]||500);});return out;}
function request_(row){var r=clean_(row);r.payload=typeof r.payload==='string'?JSON.parse(r.payload):r.payload;r.version=Number(r.version)||1;return r;}
function readRows_(book,name){var sheet=book.getSheetByName(name);if(!sheet)fail_('CONFIGURATION','Run setupGap before connecting the tracker.');var last=sheet.getLastRow();if(last<2)return [];var columns=GAP_COLUMNS_[name];return sheet.getRange(2,1,last-1,columns.length).getValues().map(function(values,index){var row={_row:index+2};columns.forEach(function(key,i){row[key]=values[i];});return row;}).filter(function(row){return !!row[columns[0]];});}
function values_(name,row){return GAP_COLUMNS_[name].map(function(key){var value=row[key];if(value==null)return '';if((key==='sapDetails'||key==='applicantDetails')&&typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&/^[\s]*[=+@-]/.test(value))return "'"+value;return value;});}
function append_(book,name,row){var sheet=book.getSheetByName(name),range=sheet.getRange(sheet.getLastRow()+1,1,1,GAP_COLUMNS_[name].length);range.setNumberFormat('@');range.setValues([values_(name,row)]);}
function replace_(book,name,number,row){var range=book.getSheetByName(name).getRange(number,1,1,GAP_COLUMNS_[name].length);range.setNumberFormat('@');range.setValues([values_(name,row)]);}
function audit_(book,actor,action,id,before,after,operationId){append_(book,'AuditLog',{id:'audit_'+Utilities.getUuid(),at:new Date().toISOString(),actor:actor.email,action:action,recordId:id,before:before?JSON.stringify(clean_(before)):'',after:after?JSON.stringify(clean_(after)):'',operationId:operationId});}
