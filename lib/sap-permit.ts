import {blankPermit,type PermitInput,type Shift} from './permits';

export type SapPermitDetails = {
  permitType:string; sapPermitNo:string; sapOrderNo:string; applicationDate:string;
  applicantName:string; department:string; locationOfWork:string; personWorking:string;
  toolsEquipment:string; equipmentName:string; equipmentNo:string; certificateRefs:string;
  hazards:string; controls:string; ppe:string; safetyProcedureNo:string;
  validFromDate:string; validFromTime:string; validToDate:string; validToTime:string;
  sapStatus:string; handoverStatus:'pending'|'handed_over'; issuerName:string;
  issuerSigned:boolean; issuerDate:string; issuerTime:string; receiverName:string;
  receiverSigned:boolean; receiverDate:string; receiverTime:string;
  checkboxReviewConfirmed:boolean;
};
export type SapScanResult={permit:PermitInput;sapDetails:SapPermitDetails;reviewNotes:string[]};

export function blankSapDetails():SapPermitDetails{return {
  permitType:'',sapPermitNo:'',sapOrderNo:'',applicationDate:'',applicantName:'',department:'',locationOfWork:'',personWorking:'',toolsEquipment:'',equipmentName:'',equipmentNo:'',certificateRefs:'',hazards:'',controls:'',ppe:'',safetyProcedureNo:'',validFromDate:'',validFromTime:'',validToDate:'',validToTime:'',sapStatus:'Needs confirmation',handoverStatus:'pending',issuerName:'',issuerSigned:false,issuerDate:'',issuerTime:'',receiverName:'',receiverSigned:false,receiverDate:'',receiverTime:'',checkboxReviewConfirmed:false
};}

const clean=(value:string)=>value.replace(/[|\s:;,.]+$/,'').replace(/^[|\s:;,.]+/,'').trim();
function field(lines:string[],label:string,nextLabels:string[]=[]):string{
  const regex=new RegExp(`(?:^|\\b)${label}\\s*[:.]?\\s*(.*)$`,'i');
  const idx=lines.findIndex(line=>regex.test(line));if(idx<0)return '';
  const match=lines[idx].match(regex);let inline=clean(match?.[1]||'');
  for(const stop of nextLabels){const pos=inline.search(new RegExp(`\\b${stop}\\b`,'i'));if(pos>=0)inline=clean(inline.slice(0,pos));}
  if(inline)return inline;
  const next=lines[idx+1]||'';
  if(nextLabels.some(stop=>new RegExp(`^\\s*(?:${stop})\\b`,'i').test(next)))return '';
  return clean(next);
}
function labelledDate(text:string,label:string):string{
  const match=text.match(new RegExp(`${label}[\\s\\S]{0,350}?(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})`,'i'));
  if(!match)return '';const d=match[1].match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)!;
  return `${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;
}
function labelledTime(text:string,label:string):string{
  const match=text.match(new RegExp(`${label}[\\s\\S]{0,350}?(\\d{1,2}:\\d{2})(?::\\d{2})?`,'i'));
  return match?`${match[1].slice(0,2).padStart(2,'0')}:${match[1].slice(3,5)}`:'';
}
function sectionFor(department:string):string{
  if(/OPER/i.test(department))return 'Operation';if(/MECH/i.test(department))return 'Mechanical';if(/ELECT/i.test(department))return 'Electrical';return '';
}
function checked(lines:string[],labels:string[]):string{
  const mark=String.raw`(?:✓|✔|☑|☒|√|\[\s*x\s*\]|\(\s*x\s*\))`;
  return labels.filter(label=>lines.some(line=>new RegExp(`${mark}.{0,35}${label}|${label}.{0,35}${mark}`,'i').test(line))).join(', ');
}
function signatureFields(text:string,section:string,endSection?:string){
  const stop=endSection?`(?=${endSection}|$)`:'$';
  const block=text.match(new RegExp(`${section}[\\s\\S]{0,1000}?${stop}`,'i'))?.[0]||'';
  const match=block.match(/Name\s*[:.]?\s*([A-Z][A-Z .'-]{1,60}?)\s+Sign[\s\S]{0,80}?Date\s*[:.]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})[\s\S]{0,40}?Time\s*[:.]?\s*(\d{1,2}:\d{2})(?::\d{2})?/i);
  if(!match)return {name:'',date:'',time:''};
  const date=match[2].match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)!;
  return {name:match[1].trim(),date:`${date[3]}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`,time:match[3].padStart(5,'0')};
}

/** OCR is only a first pass. The issuer must review text and checkbox details. */
export function parseSapPermitPhotoText(raw:string):SapScanResult{
  const lines=raw.replace(/\r/g,'\n').split('\n').map(line=>line.replace(/[\t ]+/g,' ').trim()).filter(Boolean);
  const text=lines.join(' '),normalized=text.replace(/\s+/g,' ');
  const permitType=normalized.match(/PERMIT\s+TO\s+([A-Z ]{3,30}?)(?=\s+Order\s+No|\s+Valid\s+for|$)/i)?.[1]?.trim()||'';
  const ref=normalized.match(/Order\s*No\.?\s*\/\s*CW\s*[:.]?\s*(\d{8,12})\s*\/\s*(\d{8,12})/i);
  const applicantName=field(lines,'Applicants? Name',['Department','Location of Work']);
  const department=field(lines,'Department',['Location of Work','Description of Work']);
  const locationOfWork=field(lines,'Location of Work',['Description of Work','Person Working']);
  const description=field(lines,'Description of Work',['Person Working','Tools','Equipment Name']);
  const permitNo=ref?.[1]||'',sapOrderNo=ref?.[2]||'';
  const issuer=signatureFields(normalized,'Issuer','PTW Receiver'),receiverSignature=signatureFields(normalized,'PTW Receiver');
  const details=blankSapDetails();
  Object.assign(details,{
    permitType,sapPermitNo:permitNo,sapOrderNo,
    applicationDate:labelledDate(normalized,'Date of Application'),applicantName,department,locationOfWork,
    personWorking:field(lines,'Person Working',['Tools','Equipment Name']),
    toolsEquipment:field(lines,'Tools',['Equipment Name','Equipment No','Process/Mechanical']),
    equipmentName:field(lines,'Equipment Name',['Equipment No','Process/Mechanical']),
    equipmentNo:field(lines,'Equipment No',['Process/Mechanical','Electrical']),
    certificateRefs:['Process/Mechanical','Electrical','Instrument','High Voltage Switching Certificate','Work at Height','Confined Space','Excavation'].map(label=>{const v=field(lines,label,['Process / Mechanical','Electrical','Instrument','Issuer']);return v?`${label}: ${v}`:''}).filter(Boolean).join('; '),
    hazards:checked(lines,['Confined Space','Drowning','Excavation Collapse','Toxic Gas Fumes','Hydrocarbon Area','Heavy Lifts','Dropped Objects','Chemical Hazard','Inadequate Lighting','Fall from height','Electrocution','Steam','Slipping Hazards','Awkward Access','Hazardous Substances','High Voltage','Radioactive Source','Noise','Tripping Hazard','Unguarded Opening','Pressurised Pipe Work','Static Electricity','High Pressure Jet','Vibration','Simultaneous Opn','Lone Worker','Flammable Material','Pressurised Hose','Rotating Machinery Failure']),
    controls:checked(lines,['De-Pressurised','Draining','Continuous Gas Test','Portable Fire Extinguishers','Flammables Removed','Purging','MSDS Precautions','Safe Access/Egress','Intrinsically Safe Equipment','Signs & barricading','Vented','Interlocks Required','Fire / Safety Watcher','Manual Handling Equipment','Hose Whipcheck','Scaffolding','Initial Gas Testing','Lifting Plan/Equipment','Radioactivity Controls in Place','Additional Lighting','Oxygen Content Check','Secure Loose Objects','Equipment Earthing & Bonding']),
    ppe:checked(lines,['Gloves - Leather','Gloves-Cotton','Electrical Gloves','Steam Resistant gloves','Mask Respirator','Gloves - PVC','Safety Harness','Arc Flash Suit','Chemical Splash Shield','Tool Box Meeting']),safetyProcedureNo:field(lines,'HIRAD',['Additional Controls','Shift In-Charge']),
    validFromDate:labelledDate(normalized,'Date From'),validFromTime:labelledTime(normalized,'Date From'),
    validToDate:labelledDate(normalized,'Date To'),validToTime:labelledTime(normalized,'Date To'),
    issuerName:issuer.name,issuerDate:issuer.date,issuerTime:issuer.time,
    receiverName:receiverSignature.name,receiverDate:receiverSignature.date,receiverTime:receiverSignature.time
  });
  details.sapStatus=/SAP\s+status\s*[:.]?\s*issued|permit\s+status\s*[:.]?\s*issued/i.test(normalized)||!!(details.issuerName||details.issuerDate||details.issuerTime)?'Issued in SAP — verify printed issuer details':'Needs confirmation';
  const shiftHour=Number((details.validFromTime||details.issuerTime).slice(0,2));
  const shift:Shift=shiftHour>=6&&shiftHour<14?'A':shiftHour>=14&&shiftHour<22?'B':shiftHour>=0&&shiftHour<6?'C':'G';
  const receiver=details.receiverName;
  const permit=blankPermit(details.applicationDate||details.validFromDate||new Date().toISOString().slice(0,10),shift);
  permit.orderNo=permitNo||sapOrderNo;permit.jobDescription=description;permit.receiver=receiver;
  permit.section=sectionFor(department);permit.status='pending';permit.issueTime='';permit.issuer=details.issuerName;permit.sapDetails=details;
  const reviewNotes=['Review every extracted value before saving.','Check hazards, controls, PPE and signatures against the photo.','SAP status and paper handover are separate; handover stays pending until confirmed.'];
  if(!ref)reviewNotes.push('SAP permit and work-order references were not confidently read.');
  if(!description)reviewNotes.push('Work description was not confidently read.');
  if(!receiver)reviewNotes.push('Receiver name was not confidently read.');
  return {permit,sapDetails:details,reviewNotes};
}
