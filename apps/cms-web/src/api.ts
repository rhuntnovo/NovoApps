export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api/v1/cms'+path,{method,
    ...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw new Error([data.error,...(data.issues||[])].filter(Boolean).join(' '));
  return data;
}
