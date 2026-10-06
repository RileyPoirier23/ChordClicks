const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1360,height:900}});const errs=[];p.on('pageerror',e=>errs.push('PAGE '+e.message));p.on('console',m=>m.type()==='error'&&!/Camera|NotFound|Failed to load resource/.test(m.text())&&errs.push('CON '+m.text()));
await p.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async(c)=>{if(c.video)throw new Error('none');const a=new AudioContext();return a.createMediaStreamDestination().stream;};});
await p.goto('file:///home/claude/rcc/index.html');await p.waitForTimeout(700);
// library: import via dialog
await p.click('[data-view=library]');await p.click('#lib-import');
await p.fill('#im-t','Imported One');await p.fill('#im-a','Tester');
await p.fill('#im-x','{title: ChordPro Test}\n[Verse]\n[Am]Hello [F]darkness my [C]old [G]friend\n[Am]I\'ve come to [F]talk with you [C]again [G]');
await p.click('#im-ok');await p.waitForTimeout(500);
console.log('song after import:',await p.textContent('#np-t'),'| chords:',await p.evaluate(()=>__rcc.song.text.slice(0,60).replace(/\n/g,'⏎')));
// transpose dialog
await p.click('#xpose');await p.waitForTimeout(300);await p.click('#tp-u');await p.click('#tp-u');await p.screenshot({path:'/tmp/claude-0/shots/xpose.png'});await p.click('#tp-ok');await p.waitForTimeout(300);
console.log('after transpose:',await p.evaluate(()=>__rcc.song.text.slice(0,70).replace(/\n/g,'⏎')));
// library cards
await p.click('[data-view=library]');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/claude-0/shots/lib.png'});
await p.selectOption('#lib-filter','play');console.log('playable count:',await p.evaluate(()=>document.querySelectorAll('#songs .song').length));
await p.selectOption('#lib-filter','all');
// new playlist + notes
await p.click('#pl-new');await p.fill('#ask-i','Gig A');await p.click('#ask-ok');await p.waitForTimeout(200);
// stream scenes + hotkey
await p.click('[data-view=stream]');await p.keyboard.press('Alt+Digit2');await p.waitForTimeout(300);
console.log('scene mode:',await p.evaluate(()=>__rcc.P.ov.mode));
await p.click('#ch-test');await p.waitForTimeout(200);console.log('queue:',await p.textContent('#ch-q'));
await p.screenshot({path:'/tmp/claude-0/shots/stream.png',fullPage:false});
await p.click('[data-view=settings]');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/claude-0/shots/settings.png'});
for(const v of ['practice','library','find','solo','scales','learn','tuner','gear','stream','settings']){await p.click('[data-view='+v+']');await p.waitForTimeout(200);}
// key hotkeys on practice
await p.click('[data-view=practice]');const before=await p.textContent('#cur');await p.keyboard.press('ArrowRight');await p.waitForTimeout(100);console.log('chord',before,'->',await p.textContent('#cur'));
console.log('ERRORS',errs);await b.close();})();
