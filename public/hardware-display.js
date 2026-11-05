const gib=bytes=>Number.isFinite(bytes)?(bytes/1073741824).toFixed(1)+' GB':'Unavailable';
const pct=value=>Number.isFinite(value)?Math.round(value)+'%':'Unavailable';
export function hardwareDisplay(data){
 const gpu=data?.gpus?.[0];
 return {name:gpu?.name||'GPU telemetry unavailable',sampledAt:data?.sampledAt||null,metrics:[
  {label:'TOTAL RAM',value:gib(data?.ram?.totalBytes)},
  {label:'RAM IN USE',value:gib(data?.ram?.usedBytes),detail:pct(data?.ram?.usagePercent),percent:data?.ram?.usagePercent},
  {label:'VRAM IN USE',value:gpu&&Number.isFinite(gpu.usedMiB)&&Number.isFinite(gpu.totalMiB)?(gpu.usedMiB/1024).toFixed(1)+' / '+(gpu.totalMiB/1024).toFixed(1)+' GB':'Unavailable',percent:gpu?.totalMiB?gpu.usedMiB/gpu.totalMiB*100:null},
  {label:'GPU LOAD',value:pct(gpu?.usagePercent),percent:gpu?.usagePercent},
  {label:'GPU TEMP',value:Number.isFinite(gpu?.temperatureC)?Math.round(gpu.temperatureC)+' °C':'Unavailable',percent:Number.isFinite(gpu?.temperatureC)?gpu.temperatureC:null}
 ]};
}
