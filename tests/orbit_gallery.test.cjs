const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../frontend/app.js'),'utf8');
const controller=source.slice(source.indexOf('  function createOrbitGallery('),source.indexOf('  function skeletonHome()'));
function fixture(count=3,reduced=false){
  let next=1,now=0,selected=-1;const frames=new Map(),listeners=new Map();
  function card(i){return {dataset:{recommendation:String(i)},style:{},setAttribute(){},querySelectorAll(){return [];},cloneNode(){return card(i);}};}
  const cards=Array.from({length:count},(_,i)=>card(i));
  const track={copies:[],append(card){this.copies.push(card);},clientWidth:1200,clientHeight:455,dataset:{},classList:{add(){},remove(){}},setAttribute(){},addEventListener(type,fn){listeners.set(type,fn);}};
  const document={hidden:false,addEventListener(){}};
  const context={AbortController,Math,performance:{now:()=>now},loading:false,busy:null,document,window:{addEventListener(){}},matchMedia:()=>({matches:reduced,addEventListener(){}}),$:()=>({open:false,hidden:false}),requestAnimationFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  vm.createContext(context);vm.runInContext(controller+'\nthis.make=createOrbitGallery;',context);
  const gallery=context.make(track,cards,0,id=>selected=Number(id));
  function drain(){for(let i=0;frames.size&&i<500;i++){now+=16.67;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));}assert.equal(frames.size,0,'animation must stop once settled');}
  return {gallery,track,cards,listeners,document,frames,drain,get selected(){return selected;}};
}
test('orbit switches in both directions across the loop and stops scheduling frames',()=>{const f=fixture();f.gallery.step(-1);f.drain();assert.equal(f.selected,2);f.gallery.step(1);f.drain();assert.equal(f.selected,0);f.gallery.step(1);f.gallery.step(1);f.drain();assert.equal(f.selected,2);});
test('pause commits an explicit pending selection; dispose cancels frames',()=>{const f=fixture();f.gallery.step(1);f.gallery.stop();assert.equal(f.selected,1);assert.equal(f.frames.size,0);f.gallery.step(1);f.gallery.dispose();assert.equal(f.frames.size,0);f.gallery.step(1);assert.equal(f.frames.size,0);});
test('two recommendations remain spatially distinct; one recommendation needs no animation',()=>{const two=fixture(2);assert.notEqual(two.cards[0].style.transform,two.cards[1].style.transform);two.gallery.step(1);two.drain();assert.equal(two.selected,1);const one=fixture(1);one.gallery.select(0);one.gallery.step(1);assert.equal(one.frames.size,0);});
test('reduced motion selects immediately and does not intercept browser wheel zoom',()=>{const f=fixture(3,true);f.gallery.step(1);assert.equal(f.selected,1);assert.equal(f.frames.size,0);let prevented=false;f.listeners.get('wheel')({deltaY:100,preventDefault(){prevented=true;}});assert.equal(prevented,false);const normal=fixture();normal.listeners.get('wheel')({deltaY:100,ctrlKey:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);});
test('wheel inertia settles without endless frames or data duplication',()=>{const f=fixture();let prevented=false;f.listeners.get('wheel')({deltaY:160,deltaX:0,deltaMode:0,preventDefault(){prevented=true;}});assert.equal(prevented,true);f.drain();assert.equal(f.selected,1);assert.equal(f.cards.length,3);});

test('large ring display copies preserve three real recommendations through multiple revolutions',()=>{const f=fixture();assert.ok(f.track.copies.length>0);assert.ok(f.track.copies.every(c=>!c.dataset.recommendation));for(let i=0;i<9;i++){f.gallery.step(1);f.drain();}assert.equal(f.selected,0);assert.equal(f.cards.length,3);assert.match(f.cards[0].style.transform,/^matrix3d\(/);assert.ok(f.cards.every(c=>!c.style.transform.includes('NaN')));});
