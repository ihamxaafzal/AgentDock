const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text) {
 const links=[];
 const token = value => `@@AETHERLINK${links.push(value)-1}@@`;
 let html=escape(text).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>token(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
 html=html.replace(/https?:\/\/[^\s<>]+/g,url=>token(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));
 html=html.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
 return html.replace(/@@AETHERLINK(\d+)@@/g,(_,i)=>links[Number(i)] || '');
}
export function formatResponse(text) {
 const result=[];let code=null,list=false,table=false;
 const closeList=()=>{if(list){result.push('</ul>');list=false;}};
 const closeTable=()=>{if(table){result.push('</tbody></table></div>');table=false;}};
 for(const line of String(text || '').split(/\r?\n/)) {
  if(/^\s*```/.test(line)){closeList();closeTable();if(code!==null){result.push('<pre>'+escape(code.join('\n'))+'</pre>');code=null;}else code=[];continue;}
  if(code!==null){code.push(line);continue;}
  if(/^\s*\|.+\|\s*$/.test(line)){
   closeList();if(/^[\s|:-]+$/.test(line))continue;
   const header=!table;if(!table){result.push('<div class="response-table"><table><tbody>');table=true;}
   const tag=header?'th':'td';result.push('<tr>'+line.trim().slice(1,-1).split('|').map(cell=>`<${tag}${header?' scope="col"':''}>${inline(cell.trim())}</${tag}>`).join('')+'</tr>');continue;
  }
  closeTable();
  if(/^\s*[-*]\s+/.test(line)||/^\s*\d+[.)]\s+/.test(line)){if(!list){result.push('<ul>');list=true;}result.push('<li>'+inline(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/,''))+'</li>');continue;}
  closeList();
  if(/^#{1,6}\s+/.test(line)) result.push('<h3>'+inline(line.replace(/^#{1,6}\s+/,''))+'</h3>');
  else if(/^\s*---+\s*$/.test(line)) result.push('<hr>');
  else if(line.trim()) result.push('<p>'+inline(line)+'</p>');
 }
 closeList();closeTable();if(code!==null)result.push('<pre>'+escape(code.join('\n'))+'</pre>');
 return result.join('');
}
