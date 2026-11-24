import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {preserveLegacyProfile}=require('../electron/profile');
const base=path.resolve('test-profile-data');
const standard=path.join(base,'Quilvori'),legacy=path.join(base,'nijan');
function environment(userData=standard,sessionData=userData){
 const paths={appData:base,userData,sessionData},created=[];
 return {app:{getName:()=> 'Quilvori',getPath:name=>paths[name],setPath:(name,value)=>{paths[name]=value;}},files:{mkdirSync:(folder)=>created.push(folder)},paths,created};
}
let total=0;
function test(name,run){run();total++;console.log('ok',name);}
test('renaming the app keeps the original library and browser-session directory',()=>{
 const env=environment();assert.equal(preserveLegacyProfile(env.app,env.files),legacy);assert.equal(env.paths.userData,legacy);assert.equal(env.paths.sessionData,legacy);assert.deepEqual(env.created,[legacy]);
});
test('explicit profiles remain isolated from the personal library',()=>{
 const custom=path.join(base,'isolated-preview'),env=environment(custom);preserveLegacyProfile(env.app,env.files);assert.equal(env.paths.userData,custom);assert.equal(env.paths.sessionData,custom);assert.deepEqual(env.created,[]);
});
test('an explicitly configured session directory is retained',()=>{
 const custom=path.join(base,'custom-session'),env=environment(standard,custom);preserveLegacyProfile(env.app,env.files);assert.equal(env.paths.userData,legacy);assert.equal(env.paths.sessionData,custom);
});
test('an already selected legacy profile is left in place',()=>{
 const env=environment(legacy);preserveLegacyProfile(env.app,env.files);assert.equal(env.paths.userData,legacy);assert.equal(env.paths.sessionData,legacy);assert.deepEqual(env.created,[]);
});
console.log(total+' branding compatibility checks passed');
