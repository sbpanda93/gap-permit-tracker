import { offsetDate, previousShift, type Permit, type PermitRequest, type Shift } from './permits';
export function sampleRecords(date: string, shift: Shift): {permits: Permit[]; requests: PermitRequest[]} {
  const prev=previousShift(date,shift)||{date:offsetDate(date,-1),shift:'C' as Shift};
  const make=(id:string,orderNo:string,jobDescription:string,section:string,status:Permit['status'],extra:Partial<Permit>={}):Permit=>({id,plant:'GAP',unit:'GAP',orderNo,orderType:orderNo.length===8?'MA':`M${orderNo[0]}`,jobDescription,receiver:'Sample receiver',contactNo:'',section,shiftDate:date,shift,isOnline:false,isolationTime:'',issueTime:'',extendedTime:'',returnedTime:'',status,issuer:'Sample issuer',createdBy:'sample',updatedBy:'sample',createdAt:`${date}T06:00:00Z`,updatedAt:`${date}T06:15:00Z`,version:1,...extra});
  return {permits:[
    make('sample-1','300000101','Inspect conveyor drive coupling','Mechanical','issued',{isolationTime:shift==='C'?'22:05':'06:05',issueTime:shift==='C'?'22:15':'06:15'}),
    make('sample-2','10000101','Routine electrical panel inspection','Electrical','extended',{isOnline:true,extendedTime:shift==='C'?'22:20':'06:20'}),
    make('sample-3','300000102','Clean the work area after maintenance','Operation','returned',{isOnline:true,issueTime:shift==='C'?'22:10':'06:10',returnedTime:shift==='C'?'23:30':'07:30'}),
    make('sample-4','400000101','Check motor terminal connections','Electrical','isolated',{isolationTime:shift==='C'?'22:35':'06:35'}),
    make('sample-prior-1','10000101','Routine electrical panel inspection','Electrical','issued',{shiftDate:prev.date,shift:prev.shift,isOnline:true}),
    make('sample-prior-2','300000103','Inspect transfer chute wear plates','Mechanical','issued',{shiftDate:prev.date,shift:prev.shift}),
    make('sample-prior-3','10000102','Inspect access platforms','Operation','returned',{shiftDate:prev.date,shift:prev.shift,returnedTime:'13:00'})
  ],requests:[{id:'sample-request-1',requestType:'new',payload:{unit:'GAP',orderNo:'300000104',jobDescription:'Check dust extraction duct supports',receiver:'Sample requester',contactNo:'',section:'Mechanical',shiftDate:date,shift,isOnline:false,isolationTime:'',issueTime:'',extendedTime:'',returnedTime:'',status:'pending',issuer:''},requestedBy:'sample-requester@example.invalid',requestedName:'Sample requester',requestedAt:new Date().toISOString(),decision:'pending',version:1}]};
}
