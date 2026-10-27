import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

function base(value){
 if(!value)return '';
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new TypeError('Deployment links must use HTTP(S) without credentials, query or fragment');
 return value.replace(/\/+$/,'');
}

// Repoint retained, derived feeds after a repository move. Source clocks and raw
// observation files stay unchanged: a code release is not a satellite refresh.
export async function retargetPublishedData(directory,{pagesUrl,repositoryUrl}={}){
 let meta;
 try{meta=JSON.parse(await readFile(join(directory,'meta.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return 0;throw error;}
 const pages=base(pagesUrl),repository=base(repositoryUrl),replacements=[];
 if(pages&&meta.pages_url&&base(meta.pages_url)!==pages)replacements.push([base(meta.pages_url),pages]);
 if(repository&&meta.repo_url&&base(meta.repo_url)!==repository)replacements.push([base(meta.repo_url),repository]);
 let changed=0;
 if((pages&&meta.pages_url!==pages)||(repository&&meta.repo_url!==repository)){
  if(pages)meta.pages_url=pages;
  if(repository)meta.repo_url=repository;
  await writeFile(join(directory,'meta.json'),JSON.stringify(meta,null,2)+'\n');changed++;
 }
 async function feeds(path){
  let entries;try{entries=await readdir(path,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){
   const file=join(path,entry.name);if(entry.isDirectory()){await feeds(file);continue;}
   if(!entry.isFile()||! /\.(?:kml|xml|json|geojson|csv|txt)$/i.test(entry.name))continue;
   const original=await readFile(file,'utf8');let updated=original;
   for(const [oldUrl,newUrl] of replacements)updated=updated.split(oldUrl).join(newUrl);
   if(/\.kml$/i.test(entry.name))updated=updated.replaceAll('Siaga Api','Fire Tracker');
   if(updated!==original){await writeFile(file,updated);changed++;}
  }
 }
 await feeds(join(directory,'feeds'));
 return changed;
}
