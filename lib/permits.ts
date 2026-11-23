export type Shift = 'A' | 'B' | 'C' | 'G';
export type Status = 'pending' | 'isolated' | 'issued' | 'extended' | 'returned';
export type Role = 'admin' | 'issuer' | 'requester';
import type { SapPermitDetails } from './sap-permit';
export type Permit = {
  id: string; plant: string; unit: string; orderNo: string; orderType: string;
  jobDescription: string; receiver: string; contactNo: string; section: string;
  shiftDate: string; shift: Shift; isOnline: boolean; isolationTime: string;
  issueTime: string; extendedTime: string; returnedTime: string; status: Status;
  issuer: string; createdBy: string; updatedBy: string; createdAt: string;
  updatedAt: string; version: number; deletedAt?: string; operationId?: string;
  sapDetails?: SapPermitDetails;
  applicantDetails?: {employeeId:string;email:string};
};
export type PermitInput = Omit<Permit, 'id' | 'plant' | 'orderType' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'version'> & {id?: string; version?: number};
export type PermitRequest = {id: string; targetPermitId?: string; requestType: 'new' | 'update'; payload: PermitInput; requestedBy: string; requestedName: string; requestedAt: string; decision: string; version: number};
export type Filters = {query: string; section: string; orderType: string; status: string; unit: string};
export const EMPTY_FILTERS: Filters = {query:'',section:'',orderType:'',status:'',unit:''};
export const SECTIONS = ['Mechanical', 'Electrical', 'Operation'];
export const SHIFTS: Shift[] = ['A','B','C','G'];
export const ORDER_TYPES = ['MA','M1','M2','M3','M4','SAP'];
export const STATUS_LABELS: Record<Status,string> = {pending:'Waiting for issue',isolated:'Isolated',issued:'Issued',extended:'Extended',returned:'Returned'};

export function classifyOrder(value: string): string {
  if (/^1\d{7}$/.test(value)) return 'MA';
  if (/^[1-4]\d{8}$/.test(value)) return `M${value[0]}`;
  if (/^9\d{8,11}$/.test(value) || /^\d{10,12}$/.test(value)) return 'SAP';
  return '';
}
export function plantClock(now = new Date()): {date: string; shift: Shift; time: string} {
  const pieces = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = (key: string) => pieces.find(p=>p.type===key)!.value;
  const hour = Number(get('hour'));
  const day = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  if (hour<6) day.setUTCDate(day.getUTCDate()-1);
  return {date:day.toISOString().slice(0,10),shift:hour>=6&&hour<14?'A':hour>=14&&hour<22?'B':'C',time:`${get('hour')}:${get('minute')}`};
}
export function formatDate(value: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
}
export function offsetDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+amount); return date.toISOString().slice(0,10);
}
export function previousShift(date: string, shift: string): {date:string;shift:Shift}|null {
  if (shift==='A') return {date:offsetDate(date,-1),shift:'C'};
  if (shift==='B') return {date,shift:'A'};
  if (shift==='C') return {date,shift:'B'};
  return null;
}
export function shiftScore(p: Pick<Permit,'shiftDate'|'shift'>): number {
  return Date.parse(`${p.shiftDate}T00:00:00Z`) + ({A:1,G:1.5,B:2,C:3}[p.shift]||0)*100000;
}
export function logicalKey(p: Pick<Permit,'unit'|'orderNo'>): string {return `${p.unit}\u0000${p.orderNo}`;}
export function compareLatest(a: Permit,b: Permit): number {
  return shiftScore(a)-shiftScore(b) || Date.parse(a.updatedAt||a.createdAt||'1970-01-01')-Date.parse(b.updatedAt||b.createdAt||'1970-01-01') || a.version-b.version || Number(a.status==='returned')-Number(b.status==='returned') || a.id.localeCompare(b.id);
}
export function latestByOrder(rows: Permit[]): Permit[] {
  const latest = new Map<string,Permit>();
  for (const row of rows) {const key=logicalKey(row), old=latest.get(key); if (!old||compareLatest(row,old)>0) latest.set(key,row);}
  return [...latest.values()].sort((a,b)=>a.unit.localeCompare(b.unit)||a.orderNo.localeCompare(b.orderNo));
}
export function filterPermits(rows: Permit[], filters: Filters): Permit[] {
  const q=filters.query.toLowerCase().trim();
  return rows.filter(p=>!p.deletedAt&&(!q||[p.orderNo,p.jobDescription,p.receiver,p.contactNo,p.applicantDetails?.employeeId||'',p.applicantDetails?.email||''].some(v=>v.toLowerCase().includes(q)))&&(!filters.section||p.section===filters.section)&&(!filters.orderType||p.orderType===filters.orderType)&&(!filters.status||p.status===filters.status)&&(!filters.unit||p.unit===filters.unit));
}
export function handover(rows: Permit[],date: string,shift: string) {
  const prev=previousShift(date,shift);
  if (!prev) return null;
  const prior=latestByOrder(rows.filter(p=>!p.deletedAt&&p.shiftDate===prev.date&&p.shift===prev.shift));
  const current=latestByOrder(rows.filter(p=>!p.deletedAt&&p.shiftDate===date&&p.shift===shift));
  const missing: Permit[]=[];let returned=0,extended=0;
  for (const p of prior) {
    const next=current.find(n=>logicalKey(n)===logicalKey(p));
    if (p.status==='returned'||next?.status==='returned') returned++;
    else if(next?.status==='extended') extended++;
    else missing.push(p);
  }
  return {previous:prev,total:prior.length,returned,extended,missing};
}
export function withinRange(rows: Permit[],from:string,fromShift:Shift,to:string,toShift:Shift): Permit[] {
  const low=shiftScore({shiftDate:from,shift:fromShift}),high=shiftScore({shiftDate:to,shift:toShift});
  return rows.filter(p=>!p.deletedAt&&shiftScore(p)>=low&&shiftScore(p)<=high).sort((a,b)=>shiftScore(a)-shiftScore(b)||a.orderNo.localeCompare(b.orderNo));
}
export function permitStructure(p: Pick<Permit,'isOnline'|'isolationTime'|'issueTime'>): string {
  if(p.isOnline) return p.issueTime?'Online · issued':'Online';
  if(p.isolationTime&&p.issueTime) return 'Isolated · issued';
  if(p.isolationTime) return 'Isolated';
  if(p.issueTime) return 'Issued';
  return 'Awaiting issue';
}
export const CSV_HEADERS=['Order number','Type','Plant','Unit','Shift date','Shift','Section','Job description','Receiver','Contact number','Online permit','Isolation time','Issue time','Extended time','Returned time','Status','Issuer','Last updated','Employee ID / Gatepass','Email'];
export function csvCell(value: unknown): string {
  let s=String(value??''); if(/^[\s]*[=+@-]/.test(s)) s=`'${s}`;return `"${s.replace(/"/g,'""')}"`;
}
export function permitsCSV(rows: Permit[]): string {
  return '\uFEFF'+[CSV_HEADERS,...rows.map(p=>[p.orderNo,p.orderType,p.plant,p.unit,p.shiftDate,p.shift,p.section,p.jobDescription,p.receiver,p.contactNo,p.isOnline?'Yes':'No',p.isolationTime,p.issueTime,p.extendedTime,p.returnedTime,STATUS_LABELS[p.status],p.issuer,p.updatedAt,p.applicantDetails?.employeeId||'',p.applicantDetails?.email||''])].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export function validateInput(p: PermitInput): string[] {
  const errors:string[]=[];
  if(!classifyOrder(p.orderNo))errors.push('Enter a valid MA, M1–M4 or SAP permit number.');
  if(!p.jobDescription.trim())errors.push('Enter the job description.');
  if(!p.receiver.trim())errors.push('Enter the receiver’s name.');
  if(!SECTIONS.includes(p.section))errors.push('Choose a section.');
  if(!p.unit.trim())errors.push('Choose a unit.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.shiftDate)||Number.isNaN(Date.parse(p.shiftDate+'T12:00:00Z')))errors.push('Choose a valid shift date.');
  if(!SHIFTS.includes(p.shift))errors.push('Choose a shift.');
  if(p.applicantDetails?.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.applicantDetails.email))errors.push('Enter a valid email or leave it blank.');
  if(p.contactNo&&!/^\+?\d{7,15}$/.test(p.contactNo))errors.push('Use 7–15 digits for the contact number, with an optional + prefix.');
  for(const t of [p.isolationTime,p.issueTime,p.extendedTime,p.returnedTime])if(t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))errors.push('Enter times in 24-hour HH:MM format.');
  if(p.status==='returned'&&!p.returnedTime)errors.push('Enter the returned time.');
  if(p.status==='extended'&&!p.extendedTime)errors.push('Enter the extended time.');
  const minutes=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m+(p.shift==='C'&&h<6?1440:0);};
  if(!p.isOnline&&p.isolationTime&&p.issueTime&&minutes(p.isolationTime)>minutes(p.issueTime))errors.push('Issue time must follow isolation time.');
  if(p.issueTime&&p.returnedTime&&minutes(p.issueTime)>minutes(p.returnedTime))errors.push('Returned time must follow issue time.');
  return [...new Set(errors)];
}
export function blankPermit(date:string,shift:Shift,unit='GAP'):PermitInput {
  return {unit,orderNo:'',jobDescription:'',receiver:'',contactNo:'',section:'',shiftDate:date,shift,isOnline:false,isolationTime:'',issueTime:'',extendedTime:'',returnedTime:'',status:'pending',issuer:''};
}
