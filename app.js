const APP_BUILD='20260827-errfix';
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src+'?v='+APP_BUILD;s.async=false;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src));document.body.appendChild(s)})}
loadScript('portal-ui.js').then(()=>loadScript('portal-data.js')).then(()=>loadScript('portal-render.js')).then(()=>load()).catch(e=>{const b=document.getElementById('errorBox');if(b){b.style.display='block';b.textContent='Error: '+e.message}const l=document.getElementById('loader');if(l)l.style.display='none'});
