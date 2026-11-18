import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const root=fs.realpathSync(process.cwd());
function run(command,args,cwd=root){const result=spawnSync(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.status!==0)throw new Error(result.stderr||result.stdout||`${command} failed`);return result.stdout.trim();}
run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
process.stdout.write(run(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.pages.config.ts'])+'\n');
const remote=run('git',['remote','get-url','origin']);
if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote))throw new Error('Use a GitHub HTTPS origin without credentials.');
const folder=path.resolve(root,'outputs',`pages-publish-${randomUUID()}`);
if(!folder.startsWith(root+path.sep))throw new Error('Publish directory must remain inside the project.');
fs.mkdirSync(folder,{recursive:true});fs.cpSync(path.join(root,'dist-pages'),folder,{recursive:true});fs.writeFileSync(path.join(folder,'.nojekyll'),'');
run('git',['init','--initial-branch=gh-pages'],folder);
run('git',['config','user.name',run('git',['config','user.name'])],folder);
run('git',['config','user.email',run('git',['config','user.email'])],folder);
run('git',['config','credential.https://github.com.helper','!gh auth git-credential'],folder);
run('git',['remote','add','origin',remote],folder);
const existing=run('git',['ls-remote','origin','refs/heads/gh-pages'],folder);
if(existing){run('git',['fetch','--depth=1','origin','gh-pages'],folder);run('git',['reset','--soft','FETCH_HEAD'],folder);}
run('git',['add','--all'],folder);
const unchanged=existing&&spawnSync('git',['diff','--cached','--quiet'],{cwd:folder}).status===0;
if(!unchanged)run('git',['commit','-m',`Publish GAP tracker ${run('git',['rev-parse','--short','HEAD'])}`],folder);
process.stdout.write(run('git',['push','origin','HEAD:gh-pages'],folder)+'\n');
process.stdout.write('Built website published to the gh-pages branch.\n');
