const assert=require('node:assert/strict');
const {test}=require('node:test');
const {available,parsePack,predict,simulate}=require('../engine.js');
const pack=parsePack(require('../hitter_what_if_app_data.json'));
const player=name=>pack.rows.find(row=>row.Name===name);
const read=result=>Object.fromEntries(result.details.map(row=>[row.key,row.final]));
const eps=1e-7;
const close=(a,b)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const sum=(x,keys)=>keys.reduce((s,key)=>s+x[key],0);
function check(p,result,edits){
  const x=read(result), g=x.groundball, a=x.pull_air_pp, pull=x.pull_pp;
  close(sum(x,['groundball','cache_ld_pp','cache_fb_pp','cache_pu_pp']),100);
  close(sum(x,['pull_pp','center_pp','oppo_pp'])+p.spray_other_pp,100);
  assert.ok(a>=Math.max(0,pull-g)-eps && a<=Math.min(pull,100-g)+eps,{g,a,pull});
  for(const row of result.details)if(Object.hasOwn(edits,row.key))close(row.final,row.base+edits[row.key]);
  return x;
}
test('Python replay and frozen baselines on both batting sides',()=>{
  for(const row of pack.replay)close(predict(pack.model,row),row.expected_full);
  for(const p of pack.rows)for(const side of ['L','R'])for(const mode of ['manual','linked']){
    const result=simulate(pack,p,side,{},mode);
    assert.equal(result.woba,p.anchor);
  }
});
for(const mode of ['manual','linked']){
  test(`${mode}: reject the two impossible three-way audit cases`,()=>{
    assert.throws(()=>simulate(pack,player('Paul Goldschmidt'),'L',{groundball:-10,pull_pp:8,pull_air_pp:-8},mode),/Locked GB%/);
    assert.throws(()=>simulate(pack,player('Juan Soto'),'L',{groundball:35,pull_air_pp:8},mode),/Locked GB%/);
  });
  test(`${mode}: repair unlocked Pulled AIR on upper and lower bounds`,()=>{
    const p=player('Juan Soto');
    const upper={groundball:45};
    const x=check(p,simulate(pack,p,'L',upper,mode),upper);
    close(x.pull_air_pp,100-x.groundball);
    const g=player('Paul Goldschmidt');
    const lower={groundball:-25,pull_pp:20};
    const y=check(g,simulate(pack,g,'L',lower,mode),lower);
    close(y.pull_air_pp,y.pull_pp-y.groundball);
  });
  test(`${mode}: locked Pulled AIR can move free GB or Pull instead`,()=>{
    const p=player('Juan Soto');
    const a=available(pack,p,'L');
    const air={pull_air_pp:70-a.pull_air_pp.value};
    const x=check(p,simulate(pack,p,'L',air,mode),air);
    close(x.pull_air_pp,70);
    close(x.groundball,30);
    close(x.pull_pp,70);
    const lower={groundball:10-a.groundball.value,pull_air_pp:3-a.pull_air_pp.value};
    const y=check(p,simulate(pack,p,'L',lower,mode),lower);
    close(y.pull_pp,13);
  });
}
test('reconcile a range of feasible locked shape and spray shares',()=>{
  let n=0, state=123;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(const p of pack.rows){
    const base=available(pack,p,'L'), allKeys=['groundball','cache_ld_pp','cache_fb_pp','cache_pu_pp','pull_pp','center_pp','oppo_pp','pull_air_pp'];
    for(let i=0;i<7;i++){
      const shape=allKeys.slice(0,4).map(()=>next()+0.05), spray=allKeys.slice(4,7).map(()=>next()+0.05);
      const totals=[shape.reduce((a,b)=>a+b),spray.reduce((a,b)=>a+b)];
      const goal=[...shape.map(x=>100*x/totals[0]),...spray.map(x=>(100-p.spray_other_pp)*x/totals[1])];
      const low=Math.max(0,goal[4]-goal[0]), high=Math.min(goal[4],100-goal[0]);
      goal.push(low+(high-low)*next());
      const edits=Object.fromEntries(allKeys.flatMap((k,j)=>next()<0.6?[[k,goal[j]-base[k].value]]:[]));
      check(p,simulate(pack,p,'L',edits,'manual'),edits);n++;
    }
  }
  assert.equal(n,3234);
});
