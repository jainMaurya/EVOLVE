import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x91b9aa);scene.fog=new THREE.Fog(0x91b9aa,30,85);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,150);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;$("game").appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdff4e9,0x58694b,2));
const sun=new THREE.DirectionalLight(0xffe6bd,2.2);sun.position.set(-20,30,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
const mats={
 grass:new THREE.MeshStandardMaterial({color:0x6e9e55}),dirt:new THREE.MeshStandardMaterial({color:0x806044}),stone:new THREE.MeshStandardMaterial({color:0x87918f}),
 wood:new THREE.MeshStandardMaterial({color:0x95633d}),leaves:new THREE.MeshStandardMaterial({color:0x40784b}),brick:new THREE.MeshStandardMaterial({color:0xb86f52}),
 sand:new THREE.MeshStandardMaterial({color:0xc5b27e}),water:new THREE.MeshStandardMaterial({color:0x4b9da9,transparent:true,opacity:.8}),
 skin:new THREE.MeshStandardMaterial({color:0xe5bb96}),shirt:new THREE.MeshStandardMaterial({color:0x477da0}),pants:new THREE.MeshStandardMaterial({color:0x334a62}),
 animal:new THREE.MeshStandardMaterial({color:0xd4d0b5}),npc:new THREE.MeshStandardMaterial({color:0xc79b67}),gold:new THREE.MeshStandardMaterial({color:0xe3b94e})
};
const cube=new THREE.BoxGeometry(1,1,1),blocks=new Map(),colliders=[],targets=[];
const key=(x,y,z)=>`${x},${y},${z}`;
function addBlock(x,y,z,type="grass",removable=true){let k=key(x,y,z);if(blocks.has(k))return null;let m=new THREE.Mesh(cube,mats[type]);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.userData={kind:"block",type,x,y,z,removable};scene.add(m);blocks.set(k,m);colliders.push(m);targets.push(m);return m;}
function removeMesh(m){
 if(!m)return;
 if(m.userData.kind==="block")blocks.delete(key(m.userData.x,m.userData.y,m.userData.z));
 const descendants=[];m.traverse(o=>descendants.push(o));
 for(const o of descendants){let i=colliders.indexOf(o);if(i>=0)colliders.splice(i,1);i=targets.indexOf(o);if(i>=0)targets.splice(i,1);}
 scene.remove(m);
}
function height(x,z){return Math.floor(1.1*Math.sin(x*.23)*Math.cos(z*.19)+.6*Math.sin((x+z)*.31));}
for(let x=-16;x<16;x++)for(let z=-16;z<16;z++){let h=height(x,z);addBlock(x,h,z,Math.abs(x)>11&&Math.abs(z)<3?"sand":"grass",false);if(h<0)addBlock(x,h-1,z,"dirt",false);}
function tree(x,z){let h=height(x,z);for(let y=1;y<=4;y++)addBlock(x,h+y,z,"wood",true);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=3;dy<=5;dy++)if(Math.abs(dx)+Math.abs(dz)+(dy===5?1:0)<5)addBlock(x+dx,h+dy,z+dz,"leaves",true);}
for(let i=0;i<48;i++){let x=Math.round((Math.random()-.5)*27),z=Math.round((Math.random()-.5)*27);if(Math.abs(x)<5&&Math.abs(z)<5)continue;tree(x,z);}
const water=new THREE.Mesh(new THREE.BoxGeometry(12,.1,7),mats.water);water.position.set(9,-.05,-7);scene.add(water);

// Third-person avatar
const player=new THREE.Group();scene.add(player);player.position.set(0,height(0,0)+1.05,0);
const body=new THREE.Mesh(new THREE.BoxGeometry(.62,.85,.42),mats.shirt);body.position.y=.85;body.castShadow=true;player.add(body);
const head=new THREE.Mesh(new THREE.BoxGeometry(.48,.48,.48),mats.skin);head.position.y=1.55;head.castShadow=true;player.add(head);
const hair=new THREE.Mesh(new THREE.BoxGeometry(.5,.16,.5),mats.wood);hair.position.y=1.82;player.add(hair);
const legs=[];for(let x of [-.17,.17]){let leg=new THREE.Mesh(new THREE.BoxGeometry(.22,.65,.25),mats.pants);leg.position.set(x,.32,0);player.add(leg);legs.push(leg);}
const cameraState={yaw:0,pitch:.18,distance:8.5};let locked=false,started=false,selected=1;
let verticalVelocity=0,grounded=true,jumpRequested=false,autonomous=false;
const FIRST_PERSON_DISTANCE=1.15;
const inventory={wood:8,stone:5,food:6};let coins=30,health=100,placed=0,day=1,elapsed=0,walk=0;
const counts={mine:0,build:0,trade:0,explore:0};
const ray=new THREE.Raycaster();ray.far=7;
function cameraUpdate(dt){
 const firstPerson=cameraState.distance<=1.45;
 player.visible=!firstPerson;
 const pivot=player.position.clone().add(new THREE.Vector3(0,firstPerson?1.62:1.1,0));
 const cp=Math.cos(cameraState.pitch),sp=Math.sin(cameraState.pitch);
 const back=new THREE.Vector3(-Math.sin(cameraState.yaw)*cp,sp,-Math.cos(cameraState.yaw)*cp);
 if(firstPerson){
   camera.position.lerp(pivot,Math.min(1,dt*18));
   const look=pivot.clone().add(new THREE.Vector3(Math.sin(cameraState.yaw)*cp,sp,Math.cos(cameraState.yaw)*cp).multiplyScalar(10));
   camera.lookAt(look);
 }else{
   const offset=back.clone().multiplyScalar(cameraState.distance);
   let desired=pivot.clone().add(offset);
   ray.set(pivot,offset.clone().normalize());
   const hit=ray.intersectObjects(colliders,false)[0];
   if(hit)desired=pivot.clone().add(offset.clone().normalize().multiplyScalar(Math.max(1.6,hit.distance-.4)));
   camera.position.lerp(desired,Math.min(1,dt*9));camera.lookAt(pivot);
 }
}
function toast(s){let t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),1900);}
function feed(s){$("feedline").textContent=s;}
function updateHud(){
 $("coins").textContent=coins;$("health").textContent=health;
 const fill=$("health-fill");if(fill)fill.style.width=`${health}%`;
 $("wood").textContent=inventory.wood;$("stone").textContent=inventory.stone;$("food").textContent=inventory.food;
 $("day").textContent=`DAY ${day}`;
 let best=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];$("style").textContent=best&&best[1]?best[0].toUpperCase():"UNDISCOVERED";
}
async function observe(action){counts[action]++;updateHud();try{let r=await fetch("/api/observe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,counts,coins,placed,food:inventory.food,health,wood:inventory.wood,stone:inventory.stone})});if(!r.ok)throw Error("API unavailable");let d=await r.json();$("connection").textContent="PYTHON RL · ONLINE";$("connection").className="pill online";$("rl-status").textContent="LEARNING";$("policy").textContent=d.policy.toUpperCase();$("updates").textContent=d.updates;$("vpt-samples").textContent=d.vpt_samples||0;$("epsilon").textContent=d.epsilon;$("preference").textContent=(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||["—"])[0].toUpperCase();return d;}catch(e){$("connection").textContent="PYTHON RL · OFFLINE";$("connection").className="pill offline";$("rl-status").textContent="DISCONNECTED";return null;}}
function selectedType(){return ["wood","stone","delete","food"][selected-1];}
const interactables=[];
function makeCreature(x,z,name,kind="animal"){
 const g=new THREE.Group();g.position.set(x,height(x,z)+.7,z);scene.add(g);
 const material=kind==="animal"?mats.animal:mats.npc;
 const torso=new THREE.Mesh(new THREE.BoxGeometry(.85,.55,.45),material);torso.position.y=.1;torso.castShadow=true;g.add(torso);
 const h=new THREE.Mesh(new THREE.BoxGeometry(.35,.35,.35),material);h.position.set(.48,.35,0);g.add(h);
 if(kind==="animal"){for(let lx of [-.25,.25])for(let lz of [-.13,.13]){let leg=new THREE.Mesh(new THREE.BoxGeometry(.12,.35,.12),mats.dirt);leg.position.set(lx,-.3,lz);g.add(leg);}}
 else {const cap=new THREE.Mesh(new THREE.BoxGeometry(.5,.12,.5),mats.wood);cap.position.y=.58;g.add(cap);}
 g.userData={kind,name,health:kind==="animal"?1:2,resource:kind==="animal"?"food":"coins"};interactables.push(g);targets.push(torso,h);return g;
}
const animals=[makeCreature(7,2,"Deer"),makeCreature(-8,-2,"Sheep"),makeCreature(9,-9,"Boar")];
const npcs=[makeCreature(4,3,"Mira · Builder","npc"),makeCreature(-5,4,"Tovin · Trader","npc"),makeCreature(3,-5,"Ari · Scout","npc")];
function findTarget(){ray.setFromCamera(new THREE.Vector2(0,0),camera);let hit=ray.intersectObjects(targets,false)[0];if(!hit)return null;let o=hit.object;let root=o;while(root.parent&&root.parent!==scene)root=root.parent;return {hit,root};}
function leftClickPlace(){
 let type=selectedType();
 if(type==="food"){
   if(inventory.food<=0)return toast("No food. Hunt animals or gather from leafy trees.");
   if(health>=100)return toast("Health is already full.");
   inventory.food--;health=Math.min(100,health+25);updateHud();toast("Ate food: +25 health.");feed("You ate food and restored health.");return;
 }
 let target=findTarget();if(!target||target.root.userData.kind!=="block")return toast("Aim at a block face to place.");if(type==="delete"){let m=target.root;if(m.userData.removable){removeMesh(m);toast("Block deleted.");}else toast("This terrain block cannot be deleted.");return;}if(type==="food")return toast("Food is for eating, not building.");if(inventory[type]<=0)return toast(`No ${type} left.`);let normal=target.hit.face.normal.clone().transformDirection(target.root.matrixWorld);let pos=target.root.position.clone().add(normal);let x=Math.round(pos.x),y=Math.round(pos.y),z=Math.round(pos.z);if(Math.hypot(x-player.position.x,z-player.position.z)<1.15)return toast("Too close to place.");if(addBlock(x,y,z,type,true)){inventory[type]--;placed++;observe("build");toast(`${type} block placed`);feed("You added a block to your settlement.");updateHud();}}
function rightClickHarvest(){let t=findTarget();if(!t)return toast("Aim at a tree, animal or NPC.");let root=t.root;let data=root.userData;
 if(data.kind==="block"){let type=data.type;if(!data.removable)return toast("This block cannot be harvested.");removeMesh(root);if(type==="wood"||type==="leaves"){inventory.wood+=type==="wood"?2:1;coins+=1;
   const foundFood=type==="leaves"||Math.random()<.2;if(foundFood)inventory.food+=1;
   toast(foundFood?"Harvested tree: +wood and +1 food.":"Harvested timber: +wood, +1 coin");}else if(type==="stone"){inventory.stone++;coins+=1;toast("Mined stone: +1 stone, +1 coin");}else{toast("Collected materials.");}observe("mine");feed("You harvested the environment for resources.");updateHud();return;}
 if(data.kind==="animal"||data.kind==="npc"){let kind=data.kind;interactables.splice(interactables.indexOf(root),1);removeMesh(root);if(kind==="animal"){inventory.food+=2;coins+=3;counts.hunt=(counts.hunt||0)+1;toast("Animal hunted: +2 food, +3 coins");}else{coins+=8;counts.npc=(counts.npc||0)+1;toast("NPC defeated: +8 coins. The settlement remembers.");health=Math.max(health-8,0);}observe(kind==="npc"?"trade":"mine");feed(kind==="npc"?"An NPC was defeated; village trust may suffer.":"You gathered food from an animal.");updateHud();}}
function keyDown(e){
 const code=e.code || ({w:"KeyW",a:"KeyA",s:"KeyS",d:"KeyD",ArrowUp:"ArrowUp",ArrowDown:"ArrowDown",ArrowLeft:"ArrowLeft",ArrowRight:"ArrowRight"," ":"Space"}[e.key]);
 if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(code))e.preventDefault();
 if(code==="Escape"){locked=false;document.exitPointerLock();}
 if(code&&code.startsWith("Digit")){let n=+code.slice(5);if(n>=1&&n<=4)select(n);}
 if(code==="KeyE")interact();
 if(code==="KeyV"&&started){cameraState.distance=cameraState.distance<=1.45?8.5:0.15;toast(cameraState.distance<=1.45?"First-person view":"Third-person view");}
 if(code==="Space"&&started)jumpRequested=true;
 if(code)keys[code]=true;
}
function select(n){selected=n;document.querySelectorAll(".slot").forEach(s=>s.classList.toggle("selected",+s.dataset.slot===n));}
document.querySelectorAll(".slot").forEach(s=>s.addEventListener("click",()=>select(+s.dataset.slot)));
window.addEventListener("keydown",keyDown);window.addEventListener("contextmenu",e=>e.preventDefault());
renderer.domElement.addEventListener("click",()=>{if(started&&!locked)renderer.domElement.requestPointerLock();});
document.addEventListener("pointerlockchange",()=>{locked=document.pointerLockElement===renderer.domElement;});
document.addEventListener("mousemove",e=>{if(!locked)return;cameraState.yaw-=e.movementX*.0025;cameraState.pitch=Math.max(-.45,Math.min(.75,cameraState.pitch-e.movementY*.0018));});
renderer.domElement.addEventListener("wheel",e=>{if(!started)return;e.preventDefault();cameraState.distance=THREE.MathUtils.clamp(cameraState.distance+Math.sign(e.deltaY)*.85,.15,12);},{passive:false});
renderer.domElement.addEventListener("mousedown",e=>{if(!locked)return;if(e.button===0)leftClickPlace();if(e.button===2)rightClickHarvest();});
function interact(){let near=npcs.map(n=>({n,d: n.position.distanceTo(player.position)})).sort((a,b)=>a.d-b.d)[0];if(!near||near.d>3.8)return toast("Move closer to a villager.");if(near.n.userData.name.includes("Tovin")){if(inventory.wood>=2){inventory.wood-=2;coins+=12;toast("Sold 2 wood for 12 coins.");observe("trade");}else if(coins>=8){coins-=8;inventory.stone+=2;toast("Bought 2 stone for 8 coins.");observe("trade");}else toast("Tovin: 2 wood = 12 coins, or 8 coins = 2 stone.");}else if(near.n.userData.name.includes("Mira")){if(coins>=10){coins-=10;inventory.brick=(inventory.brick||0)+3;toast("Mira supplied 3 bricks.");observe("trade");}else toast("Mira: 10 coins buys 3 bricks.");}else{inventory.food+=2;toast("Ari shared 2 food.");observe("explore");}updateHud();}
let rlEventTimer=0;
async function requestPythonWorldEvent(){
 try{
  const response=await fetch("/api/world-action");
  if(!response.ok)throw new Error("Python RL endpoint unavailable");
  const data=await response.json();
  $("policy").textContent=data.policy.toUpperCase();$("updates").textContent=data.updates;
  $("epsilon").textContent=data.epsilon;$("rl-status").textContent="AUTONOMOUS";
  const action=data.action;
  let reward=0.25;
  if(action==="build"){
   let built=0;
   for(let tries=0;tries<12;tries++){let x=Math.round(player.position.x+(Math.random()-.5)*10),z=Math.round(player.position.z+3+Math.random()*7),y=height(x,z)+1;
    if(!blocks.has(key(x,y,z))&&addBlock(x,y,z,"wood",true)){built=1;placed++;break;}}
   if(built){counts.build=(counts.build||0)+1;reward=2.0;toast("RL builder placed a structure.");}else reward=-0.4;
  }else if(action==="hunt"){
   const preferNpc=(counts.npc||0)>(counts.hunt||0);
   const candidates=interactables.filter(o=>o.userData.kind===(preferNpc?"npc":"animal"));
   const prey=candidates.sort((a,b)=>a.position.distanceTo(player.position)-b.position.distanceTo(player.position))[0];
   if(prey){const kind=prey.userData.kind;removeMesh(prey);interactables.splice(interactables.indexOf(prey),1);
    if(kind==="animal"){inventory.food+=2;coins+=2;counts.hunt=(counts.hunt||0)+1;reward=1.8;toast("RL hunter caught an animal: +2 food.");}
    else{coins+=5;health=Math.max(0,health-5);counts.npc=(counts.npc||0)+1;reward=-1.5;toast("RL raiders defeated an NPC: +5 coins, -5 health.");}}
   else {inventory.food+=1;reward=0.2;toast("RL hunter foraged: +1 food.");}
  }else if(action==="gather"){
   inventory.wood+=2;reward=0.9;toast("RL workers gathered +2 wood.");
  }else if(action==="trade"){coins+=3;reward=0.6;toast("RL traders earned +3 coins.");}
  else {
   let x=Math.round(player.position.x+(Math.random()-.5)*14),z=Math.round(player.position.z+(Math.random()-.5)*14);
   tree(x,z);reward=0.35;toast("RL scouts expanded the woodland.");
  }
  updateHud();feed(`Python agent acted independently: ${action}.`);
  const result=await fetch("/api/world-result",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reward,counts,coins,placed,wood:inventory.wood,stone:inventory.stone,food:inventory.food,health})});
  if(result.ok){const learned=await result.json();$("updates").textContent=learned.updates;$("vpt-samples").textContent=learned.vpt_samples||0;$("epsilon").textContent=learned.epsilon;$("policy").textContent=learned.policy.toUpperCase();}
 }catch(e){$("rl-status").textContent="DISCONNECTED";}
}
function animate(t){requestAnimationFrame(animate);let dt=Math.min(clock.getDelta(),.04);if(started){rlEventTimer+=dt;if(autonomous&&rlEventTimer>=12){rlEventTimer=0;requestPythonWorldEvent();}let fwd=new THREE.Vector3(Math.sin(cameraState.yaw),0,Math.cos(cameraState.yaw));
 let right=new THREE.Vector3(-fwd.z,0,fwd.x);
 let dir=new THREE.Vector3();
 if(keys.KeyW||keys.ArrowUp)dir.add(fwd);
 if(keys.KeyS||keys.ArrowDown)dir.sub(fwd);
 if(keys.KeyD||keys.ArrowRight)dir.add(right);
 if(keys.KeyA||keys.ArrowLeft)dir.sub(right);if(dir.lengthSq()){dir.normalize();let speed=(keys.ShiftLeft||keys.ShiftRight)?7:4.8;let next=player.position.clone().addScaledVector(dir,speed*dt);let px=Math.round(next.x),pz=Math.round(next.z);let blocked=false;for(let [k,m] of blocks){let dx=Math.abs(m.position.x-next.x),dz=Math.abs(m.position.z-next.z);let top=m.position.y+.5;if(dx<.72&&dz<.72&&top>player.position.y-.3&&m.position.y<player.position.y+1.7){blocked=true;break;}}if(!blocked){player.position.x=next.x;player.position.z=next.z;}player.rotation.y=Math.atan2(dir.x,dir.z);walk+=dt*10;legs[0].rotation.x=Math.sin(walk)*.45;legs[1].rotation.x=-Math.sin(walk)*.45;}let floor=height(Math.round(player.position.x),Math.round(player.position.z))+1.05;
 if(jumpRequested&&grounded){verticalVelocity=10.5;grounded=false;}
 jumpRequested=false;
 verticalVelocity-=18*dt;player.position.y+=verticalVelocity*dt;
 if(player.position.y<=floor){player.position.y=floor;verticalVelocity=0;grounded=true;}
 cameraUpdate(dt);elapsed+=dt;const remaining=Math.max(0,240-elapsed);const timerEl=$("day-timer");if(timerEl)timerEl.textContent=`${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(Math.floor(remaining%60)).padStart(2,"0")} TO NIGHT`;if(elapsed>=240){elapsed=0;day++;$("day").textContent=`DAY ${day}`;toast(`Day ${day-1} ended. Day ${day} begins.`);}}
 renderer.render(scene,camera);}
const keys={};
 window.addEventListener("keyup",e=>{keys[e.code]=false;if(e.key)keys[e.key]=false;});
 window.addEventListener("blur",()=>{for(const k in keys)keys[k]=false;});
const clock=new THREE.Clock();updateHud();camera.position.set(0,6,-8);camera.lookAt(player.position);
$("start").addEventListener("click",()=>{$("welcome").style.display="none";started=true;cameraState.distance=8.5;cameraUpdate(1);renderer.domElement.requestPointerLock();toast("Third-person view. V toggles first/third person; scroll to zoom.");});
const autoBtn=$("auto-toggle");
if(autoBtn)autoBtn.addEventListener("click",()=>{autonomous=!autonomous;autoBtn.textContent=autonomous?"RL AUTONOMY: ON":"RL AUTONOMY: OFF";autoBtn.classList.toggle("active",autonomous);rlEventTimer=0;toast(autonomous?"Python RL is now acting in your world.":"You are back in control.");});

fetch("/api/status").then(r=>r.json()).then(d=>{$("connection").textContent="PYTHON RL · ONLINE";$("connection").className="pill online";$("updates").textContent=d.updates;$("vpt-samples").textContent=d.vpt_samples||0;$("epsilon").textContent=d.epsilon;$("policy").textContent=d.policy.toUpperCase();}).catch(()=>{$("connection").textContent="PYTHON RL · OFFLINE";});
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});animate();
