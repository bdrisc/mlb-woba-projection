"use strict";

const $=id=>document.getElementById(id);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!=null)element.textContent=text;return element;};
let data, player, edits={}, last, bioDirectory;
const featured=new Set(['chase','zone_contact','barrel','hard_hit','avg_ev_mph','bat_speed_mph']);
const groups=[
  ['Plate discipline',['chase','zone_swing','zone_contact','outside_contact']],
  ['Contact quality',['barrel','hard_hit','avg_ev_mph','ev90_mph']],
  ['Spray',['pull_pp','center_pp','oppo_pp','pull_air_pp','avg_launch_angle_deg','groundball','cache_ld_pp','cache_fb_pp','cache_pu_pp']],
  ['Running',['sprint_speed_fps']],
  ['Swing and stance',['bat_speed_mph','swing_length_ft','attack_angle_deg','swing_tilt_deg','depth_in_box_in','off_plate_in','feet_apart_in','stance_angle_open_deg']],
];
const metricNames={
  chase:'O-Swing%',zone_swing:'Z-Swing%',zone_contact:'Z-Contact%',outside_contact:'O-Contact%',
  barrel:'Barrel%',hard_hit:'Hard-Hit%',groundball:'GB%',
  avg_ev_mph:'Avg EV',ev90_mph:'EV90',avg_launch_angle_deg:'Avg Launch Angle',
  cache_ld_pp:'LD%',cache_fb_pp:'FB%',cache_pu_pp:'PU%',
  pull_pp:'Pull%',center_pp:'Straight%',oppo_pp:'Oppo%',pull_air_pp:'Pull AIR%',
  sprint_speed_fps:'Sprint Speed',bat_speed_mph:'Bat Speed',swing_length_ft:'Swing Length',
  attack_angle_deg:'Attack Angle',swing_tilt_deg:'Swing Path Tilt',
  depth_in_box_in:'Depth in Box',off_plate_in:'Distance off Plate',
  feet_apart_in:'Distance Between Feet',stance_angle_open_deg:'Stance Angle',
};
const metricName=(key,m)=>metricNames[key]||m.label;
const byName=new Intl.Collator('en',{sensitivity:'base',numeric:true});
const WOBA_DECIMALS=3, TABLE_DECIMALS=1;
const fmt=(n,d=2)=>Number.isFinite(n)?(Math.abs(n)<.5*10**-d?0:n).toFixed(d):'—';
const signed=(n,d=2)=>Number.isFinite(n)?(n>=.5*10**-d?'+':'')+fmt(n,d):'—';

function showError(text=''){$('error').hidden=!text;$('error').textContent=text;}

function scenarioMode(){return document.querySelector('input[name=mode]:checked').value;}

function markPending(){
  $('pending').textContent='Edits pending';
  $('scenario').textContent=$('delta').textContent='—';
  $('summary').textContent='';
  $('details').replaceChildren();
  $('rangeNote').hidden=true;
  last=null;
  showError();
}

function loadPack(d){
  data=WobaEngine.parsePack(d);
  player=null;
  edits={};
  last=null;
  document.body.dataset.loaded='true';
  $('dataset').textContent=data.rows.length+' hitters';
  loadPlayerBios();
  $('search').value='';
  fillPlayers(true);
  $('workbench').hidden=false;
  showError();
  selectPlayer();
}

function fillPlayers(initial=false){
  const q=$('search').value.trim().toLowerCase();
  const matches=data.rows.filter(p=>p.Name.toLowerCase().includes(q)||String(p.MLBAM_ID).includes(q))
    .sort((a,b)=>byName.compare(a.Name,b.Name)||byName.compare(a.MLBAM_ID,b.MLBAM_ID));
  const select=$('player');
  select.replaceChildren(...matches.map(p=>{const o=node('option',p.Name);o.value=String(p.MLBAM_ID);return o;}));
  select.disabled=!matches.length;
  if(player&&matches.some(p=>p.MLBAM_ID===player.MLBAM_ID))select.value=String(player.MLBAM_ID);
  else if(!initial){
    const ph=node('option',matches.length?'Choose a matching hitter':'No hitters match');
    ph.value='';
    ph.disabled=true;
    select.prepend(ph);
    select.value='';
  }
  const waiting=!select.value;
  $('scenarioArea').hidden=waiting;
  $('searchNote').textContent=matches.length?'Choose a hitter from the filtered list.':'No hitters matched. Try part of a name or an MLBAM ID.';
  $('searchNote').hidden=!waiting;
}

function selectPlayer(){
  const next=data.rows.find(p=>String(p.MLBAM_ID)===$('player').value);
  if(!next)return;
  showError();
  $('scenarioArea').hidden=false;
  $('searchNote').hidden=true;
  if(next===player)return;
  player=next;edits={};
  $('out-head').textContent=player.Name;
  drawBio();
  const sides=d=>data.metrics.filter(m=>m.side&&Number.isFinite(player[m.key+'_'+d])).length;
  $('side').value=sides('L')>sides('R')?'L':'R';
  drawEdits();
  runScenario();
}

function drawBio(){
  if(!player)return;
  const bio=bioDirectory?.[player.MLBAM_ID];
  const parts=[
    bio?.position,
    Number.isFinite(player.Age)?'Age '+player.Age+' ('+player.Season+')':null,
    bio?.bats&&bio?.throws?'B/T: '+bio.bats+'/'+bio.throws:null,
    bio?.height,
    bio?.weight?bio.weight+' lb':null,
  ].filter(Boolean);
  const list=$('playerBio');
  list.replaceChildren(...parts.map(part=>node('li',part)));
  list.hidden=!parts.length;
}
let bioRequest;

function loadPlayerBios(){
  if(bioRequest)return;
  bioRequest=fetch('player-bios.json').then(r=>{
    if(!r.ok)throw Error('Player bio data unavailable');
    return r.json();
  }).then(snapshot=>{
    bioDirectory=snapshot.players;
    if(data)drawBio();
  }).catch(()=>{bioRequest=null;});
}

function playerMetrics(){return WobaEngine.available(data,player,$('side').value);}

function drawEdits(){
  const m=playerMetrics(),picker=$('metric'),prior=picker.value;
  picker.replaceChildren(...groups.map(([label,keys])=>{
    const group=node('optgroup');
    group.label=label;
    for(const k of keys){
      const v=m[k];
      if(!v||k in edits)continue;
      const item=node('option',metricName(k,v)+(v.value==null?' · unavailable':''));
      item.value=k;
      item.disabled=v.value==null;
      group.append(item);
    }
    return group;
  }).filter(group=>group.children.length));
  if([...picker.options].some(o=>o.value===prior&&!o.disabled))picker.value=prior;
  $('add').disabled=!picker.value;
  $('edits').replaceChildren();
  for(const [k,value] of Object.entries(edits)){
    const mtr=m[k],row=node('div');row.className='edit';
    const label=node('label',metricName(k,mtr)), input=node('input');
    input.type='number';
    input.step='any';
    input.id='edit-'+k;
    input.value=value;
    input.min=mtr.min-mtr.value;input.max=mtr.max-mtr.value;
    label.htmlFor=input.id;label.append(node('small','Baseline '+fmt(mtr.value)+' '+mtr.unit));
    input.addEventListener('input',()=>{edits[k]=input.value;markPending();});
    const rem=node('button','×');rem.type='button';rem.setAttribute('aria-label','Remove '+metricName(k,mtr));
    rem.addEventListener('click',()=>{delete edits[k];drawEdits();markPending();});
    row.append(label,input,rem);$('edits').append(row);
  }
  if(!Object.keys(edits).length){const p=node('p','No edits yet. Add a metric to start.');p.className='empty';$('edits').append(p);}
}

function modeNote(){
  $('modeNote').textContent=scenarioMode()==='manual'?'Only your edits and required adjustments.':'Your edits stay locked. Other skills can move with them.';
}

function runScenario(){
  if(!player||$('player').value!==String(player.MLBAM_ID))return;
  try{
    const parsed={};
    for(const [key,value] of Object.entries(edits)){
      if(value==='')throw Error('Fill every adjustment or remove the empty edit.');
      parsed[key]=Number(value);
    }
    last=WobaEngine.simulate(data,player,$('side').value,parsed,scenarioMode());
    $('baseline').textContent=fmt(player.anchor,WOBA_DECIMALS);
    $('scenario').textContent=fmt(last.woba,WOBA_DECIMALS);
    $('delta').textContent=signed(last.effect,WOBA_DECIMALS);
    const moved=last.details.filter(r=>Number.isFinite(r.linked)&&Math.abs(r.linked)>=.005).length;
    const constrained=last.details.filter(r=>Number.isFinite(r.rule)&&Math.abs(r.rule)>=.005).length;
    $('summary').textContent=Object.keys(edits).length+' locked · '+moved+' linked adjustments · '+constrained+' rule adjustments';
    const warnings=[];
    if(last.beyond.length)warnings.push('Outside typical historical changes: '+last.beyond.join(', ')+'. Treat this wOBA as an extrapolation.');
    if(last.thin.length)warnings.push('Limited history to check the range for '+last.thin.join(', ')+'.');
    if(last.unsupported)warnings.push('Withheld '+last.unsupported+' linked '+(last.unsupported===1?'adjustment':'adjustments')+' because the edits were outside comparable history.');
    $('rangeNote').textContent=warnings.join(' ');
    $('rangeNote').hidden=!warnings.length;
    $('pending').textContent='';
    showError();
    drawResults();
  }catch(e){markPending();showError(e.message);}
}

function drawResults(){
  if(!last)return;
  const m=playerMetrics();
  const changed=last.details.filter(r=>r.key in edits||Math.abs(r.linked)>=.005||Math.abs(r.rule)>=.005);
  const visible=$('all').checked?last.details:changed.length?changed:last.details.filter(r=>featured.has(r.key));
  const rows=visible.map(r=>{
    const tr=node('tr');
    tr.append(node('th',metricName(r.key,m[r.key])));tr.firstChild.scope='row';
    const active=r.key in edits;
    for(const t of [fmt(r.base,TABLE_DECIMALS),active?signed(r.edit,TABLE_DECIMALS):'—',signed(r.linked,TABLE_DECIMALS),signed(r.rule,TABLE_DECIMALS),fmt(r.final,TABLE_DECIMALS)])tr.append(node('td',t));
    if(Math.abs(r.linked)>=.005||Math.abs(r.rule)>=.005)tr.children[5].className='change';
    return tr;
  });
  $('details').replaceChildren(...rows);
}

async function loadHitters(){
  try{
    const response=await fetch('./hitter_what_if_app_data.json');
    if(!response.ok)throw Error('Hitter data could not be loaded. Try refreshing the page.');
    const pack=await response.json();
    if(pack.demo)throw Error('The hitter data is unavailable.');
    loadPack(pack);
  }catch(e){
    $('dataset').textContent='No hitters loaded';
    showError(e.message);
  }
}
$('search').addEventListener('input',()=>{fillPlayers();showError();});
$('player').addEventListener('change',selectPlayer);
$('side').addEventListener('change',()=>{
  let removed=0;
  for(const [k,m] of Object.entries(playerMetrics()))if(k in edits&&m.side){delete edits[k];removed++;}
  drawEdits();markPending();
  if(removed)$('pending').textContent='Cleared side-specific edits. Run to update.';
});
document.querySelectorAll('input[name=mode]').forEach(r=>r.addEventListener('change',()=>{modeNote();markPending();}));
$('add').addEventListener('click',()=>{const k=$('metric').value;if(!k)return;edits[k]='0';drawEdits();markPending();$('edit-'+k).focus();});
$('reset').addEventListener('click',()=>{edits={};drawEdits();runScenario();});
$('run').addEventListener('click',runScenario);
$('all').addEventListener('change',drawResults);

loadHitters();
