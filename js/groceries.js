'use strict';
/* Groceries: one shopping list grouped by shop section. Items are sorted into sections by name
   (English, Russian and Uzbek words), ticked items drop into "In Cart", and the list learns:
   things you bought before come back with one tap, and if you move an item to another section
   it goes there next time too. */

const SECTIONS = [
  { id: 'produce', name: 'Fruit & Vegetables', g: 'apple', c: '#34C759', kw: 'apple,banana,orange,mandarin,tangerine,lemon,lime,grape,pear,peach,apricot,plum,cherry,cherries,strawberr,raspberr,blueberr,berry,berries,melon,watermelon,pomegranate,kiwi,mango,pineapple,persimmon,fig,quince,fruit,tomato,cucumber,potato,onion,garlic,carrot,cabbage,lettuce,salad,bell pepper,chili,eggplant,aubergine,zucchini,courgette,pumpkin,beet,radish,spinach,dill,parsley,cilantro,coriander,basil,mint,greens,herbs,mushroom,corn,broccoli,cauliflower,avocado,ginger,celery,turnip,green onion,spring onion,veg,яблок,банан,апельсин,мандарин,лимон,виноград,груш,персик,абрикос,слив,вишн,черешн,клубник,малин,ягод,дын,арбуз,гранат,киви,манго,ананас,хурм,инжир,айв,фрукт,помидор,томат,огур,картош,картоф,лук,чеснок,морков,капуст,салат,перец,баклажан,кабач,тыкв,свекл,редис,редьк,шпинат,укроп,петрушк,кинз,базилик,мят,зелень,гриб,кукуруз,брокколи,авокадо,имбир,овощ,olma,banan,apelsin,mandarin,limon,uzum,nok,shaftoli,o\'rik,olxo\'ri,olcha,gilos,qulupnay,malina,qovun,tarvuz,anor,xurmo,anjir,behi,meva,pomidor,bodring,kartoshka,piyoz,sarimsoq,sabzi,karam,salat,qalampir,bulg\'or qalampiri,baqlajon,qovoq,lavlagi,rediska,turp,ismaloq,ukrop,shivit,petrushka,kashnich,rayhon,yalpiz,ko\'kat,qo\'ziqorin,makkajo\'xori,zanjabil,sabzavot' },
  { id: 'bakery', name: 'Bread & Bakery', g: 'bread', c: '#C8893B', kw: 'bread,loaf,baguette,bun,buns,roll,rolls,croissant,cake,pie,pita,lavash,tortilla,bagel,muffin,toast,flatbread,хлеб,батон,булк,багет,лаваш,лепешк,лепёшк,пирог,торт,круассан,кекс,выпечк,non,bulka,patir,somsa,pirog,tort,kruassan' },
  { id: 'dairy', name: 'Dairy & Eggs', g: 'milk', c: '#32ADE6', kw: 'milk,egg,eggs,cheese,butter,yogurt,yoghurt,kefir,cream,sour cream,cottage cheese,curd,mozzarella,ayran,молок,яйц,яиц,сыр,сливочное масло,йогурт,кефир,сливк,сметан,творог,ряженк,айран,брынз,sut,tuxum,pishloq,sariyog\',yogurt,kefir,qaymoq,smetana,suzma,tvorog,qatiq,ayron' },
  { id: 'meat', name: 'Meat & Fish', g: 'fish', c: '#FF3B30', kw: 'meat,beef,veal,chicken,lamb,mutton,pork,turkey,mince,minced,sausage,sausages,ham,bacon,salami,fish,salmon,tuna,shrimp,prawn,steak,wings,fillet,liver,мяс,говядин,телятин,куриц,курин,баранин,свинин,индейк,фарш,колбас,сосиск,сардельк,ветчин,бекон,рыб,лосос,семг,тунец,креветк,стейк,крылыш,филе,печень,go\'sht,gosht,mol go\'shti,tovuq,qo\'y go\'shti,qiyma,kolbasa,sosiska,baliq,jigar,qanot' },
  { id: 'pantry', name: 'Pantry', g: 'jar', c: '#FF9500', kw: 'rice,pasta,spaghetti,noodle,noodles,macaroni,flour,sugar,salt,oil,olive oil,sunflower oil,vinegar,sauce,ketchup,mayo,mayonnaise,mustard,spice,spices,black pepper,cinnamon,cumin,honey,jam,cereal,oat,oats,oatmeal,buckwheat,beans,lentil,lentils,chickpea,chickpeas,peas,tea,coffee,cocoa,canned,tomato paste,yeast,baking powder,baking soda,nuts,walnut,almond,peanut,raisin,raisins,dates,peanut butter,semolina,bulgur,рис,макарон,спагетти,лапш,мук,сахар,соль,масло,растительное масло,уксус,соус,кетчуп,майонез,горчиц,специ,приправ,корица,зира,мёд,мед,варень,джем,хлопь,овсян,гречк,фасол,чечевиц,нут,горох,чай,кофе,какао,консерв,томатная паста,дрожж,разрыхлител,сода,орех,миндал,арахис,изюм,финик,манк,guruch,makaron,lag\'mon,un,shakar,tuz,yog\',o\'simlik yog\'i,sirka,sous,ketchup,mayonez,xantal,ziravor,dolchin,zira,asal,murabbo,jem,suli,grechka,loviya,mosh,yasmiq,no\'xat,choy,qahva,kofe,kakao,konserva,tomat pasta,xamirturush,soda,yong\'oq,bodom,yeryong\'oq,mayiz,xurmo,manka' },
  { id: 'drinks', name: 'Drinks', g: 'bottle', c: '#007AFF', kw: 'water,juice,soda,cola,coke,pepsi,fanta,sprite,lemonade,beer,wine,drink,drinks,mineral water,compote,energy drink,вод,сок,газировк,кола,лимонад,пиво,вин,напит,компот,минералк,энергетик,suv,sharbat,gazli suv,kola,limonad,pivo,vino,ichimlik,kompot,mineral suv' },
  { id: 'frozen', name: 'Frozen', g: 'snow', c: '#64D2FF', kw: 'ice cream,frozen,dumplings,pelmeni,manti,ice,морожен,пельмен,манты,заморож,вареник,лёд,muzqaymoq,chuchvara,manti,muzlatilgan,muz' },
  { id: 'snacks', name: 'Snacks & Sweets', g: 'candy', c: '#FF2D55', kw: 'chocolate,candy,candies,sweets,cookie,cookies,biscuit,biscuits,chips,crisps,crackers,snack,snacks,gum,chewing gum,wafer,wafers,marshmallow,popcorn,шоколад,конфет,сладост,печенье,чипс,сухар,крекер,вафл,жвачк,зефир,попкорн,снек,shokolad,konfet,shirinlik,pechenye,chips,kreker,vafli,saqich,zefir,popkorn' },
  { id: 'household', name: 'Household', g: 'spray', c: '#AF52DE', kw: 'detergent,washing powder,laundry,dish soap,dishwashing,sponge,sponges,paper towel,paper towels,toilet paper,napkins,napkin,trash bags,bin bags,garbage bags,foil,cling film,bleach,cleaner,battery,batteries,light bulb,candles,tissues,порош,стиральн,средство для,губк,бумажные полотенц,туалетн,салфет,мусорн,пакеты,фольг,пленк,отбел,чистящ,батарейк,лампочк,свеч,kir yuvish,poroshok,gubka,salfetka,hojatxona qog\'ozi,axlat paketi,paket,folga,batareya,lampochka,sham' },
  { id: 'care', name: 'Personal Care', g: 'drop', c: '#5856D6', kw: 'soap,shampoo,conditioner,toothpaste,toothbrush,deodorant,lotion,hand cream,face cream,razor,shaving,pads,diapers,cotton,sunscreen,shower gel,мыл,шампун,бальзам,зубная паста,зубн,дезодорант,крем,лосьон,бритв,прокладк,подгузник,ват,гель для душа,sovun,shampun,tish pastasi,tish cho\'tkasi,dezodorant,krem,ustara,taglik,paxta' },
  { id: 'other', name: 'Other', g: 'bag', c: '#8E8E93', kw: '' },
];
const secOf = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[SECTIONS.length - 1];
const normApos = (s) => s.toLowerCase().replace(/[’‘ʻʼ`´]/g, "'").replace(/ё/g, 'е');
const GKW = [];
for (const s of SECTIONS) for (const k of s.kw.split(',')) if (k.trim()) GKW.push([normApos(k.trim()), s.id]);
// Pick the section whose keyword matches the start of a word, preferring the longest match.
function guessSection(name) {
  const low = normApos(name.trim());
  const k = S.grocery.known[low];
  if (k && k.sec) return k.sec;
  const hay = ' ' + low.replace(/[^\p{L}\p{N}']+/gu, ' ').trim() + ' ';
  let best = null;
  for (const [kw, sec] of GKW) if (hay.includes(' ' + kw) && (!best || kw.length > best[0].length)) best = [kw, sec];
  return best ? best[1] : 'other';
}
const UNITS = 'kg|kgs|g|gr|grams?|mg|l|ltr|litres?|liters?|ml|pcs|pc|pieces?|packs?|pk|boxes|box|bottles?|cans?|dozen|bags?|шт|кг|г|гр|л|мл|пачк[аи]?|банк[аи]?|бутылк[аи]?|dona|ta|kilo|litr|paket';
const Q_FRONT = new RegExp(`^((?:x\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:${UNITS})?\\.?|x\\d+)\\s+(.+)$`, 'i');
const Q_BACK = new RegExp(`^(.+?)\\s+((?:x\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:${UNITS})?\\.?)$`, 'i');
// "2 kg rice" / "rice 2kg" / "milk x2" → name + amount.
function parseItem(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  let qty = '';
  let m = s.match(Q_FRONT);
  if (m) { qty = m[1]; s = m[2]; } else if ((m = s.match(Q_BACK))) { s = m[1]; qty = m[2]; }
  s = s.replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '');
  return { name: s ? s[0].toUpperCase() + s.slice(1) : '', qty: qty.trim() };
}
function remember(item) {
  const low = normApos(item.name);
  const k = S.grocery.known[low];
  S.grocery.known[low] = { name: item.name, sec: item.sec, n: (k ? k.n : 0) + 1, last: Date.now() };
  const keys = Object.keys(S.grocery.known);
  if (keys.length > 400) keys.sort((a, b) => S.grocery.known[a].last - S.grocery.known[b].last).slice(0, keys.length - 400).forEach((x) => delete S.grocery.known[x]);
}
function addGrocery(raw) {
  const { name, qty } = parseItem(raw);
  if (!name) return null;
  const low = normApos(name);
  const items = S.grocery.items;
  const open = items.find((i) => !i.done && normApos(i.name) === low);
  if (open) { if (qty) open.qty = qty; save(); return open; }
  const inCart = items.findIndex((i) => i.done && normApos(i.name) === low);
  if (inCart >= 0) items.splice(inCart, 1);
  const k = S.grocery.known[low];
  const item = { id: uid(), name: k ? k.name : name, qty, sec: guessSection(name), done: false, at: Date.now() };
  items.push(item);
  remember(item);
  save();
  return item;
}

// ---------- Screen ----------
function gRow(i) {
  const s = secOf(i.sec);
  return swipeRow(`<div class="task g-item${i.done ? ' is-done' : ''}" style="--c:${s.c}">
      <button class="chk" data-act="g-toggle" data-id="${i.id}" aria-label="${i.done ? 'Put back on the list' : 'In the cart'}"></button>
      <button class="t-main" data-act="g-edit" data-id="${i.id}"><span class="t-title">${esc(i.name)}</span>${i.qty ? `<span class="g-qty">${esc(i.qty)}</span>` : ''}</button>
    </div>`, { right: swBtn('g-del', i.id, 'Delete', 'trash', 'var(--red)'), attrs: `data-gid="${i.id}"` });
}
function againList() {
  const open = new Set(S.grocery.items.filter((i) => !i.done).map((i) => normApos(i.name)));
  return Object.entries(S.grocery.known).filter(([k]) => !open.has(k)).map(([, v]) => v)
    .sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 14);
}
function gListHtml() {
  const items = S.grocery.items;
  const open = items.filter((i) => !i.done), done = items.filter((i) => i.done);
  const again = againList();
  let html = again.length ? `<div class="again"><div class="again-h">Buy again</div><div class="chips-row no-drag">${again.map((k) => `<button class="chip" data-act="g-again" data-v="${esc(k.name)}" style="--c:${secOf(k.sec).c}">${glyph('plus')}${esc(k.name)}</button>`).join('')}</div></div>` : '';
  if (!items.length) html += empty('cart', 'Your list is empty', 'Type what you need above — items are sorted into shop sections for you.');
  for (const s of SECTIONS) {
    const its = open.filter((i) => secOf(i.sec).id === s.id).sort((a, b) => a.at - b.at);
    if (its.length) html += `<h2 class="sec gsec" style="--c:${s.c}">${glyph(s.g)}${esc(s.name)}<span class="n">${its.length}</span></h2><div class="card">${its.map(gRow).join('')}</div>`;
  }
  if (done.length) html += `<h2 class="sec gsec cart">${glyph('cart')}In Cart<span class="n">${done.length}</span><button class="sec-btn" data-act="g-clear">Clear</button></h2><div class="card">${done.sort((a, b) => b.doneAt - a.doneAt).map(gRow).join('')}</div>`;
  return html;
}
const gSub = () => { const n = S.grocery.items.filter((i) => !i.done).length; return n ? `${plural(n, 'item')} to buy` : ''; };
SCREENS.groceries = {
  tint: () => '#34C759',
  render() {
    const body = `<div class="g-add"><label class="g-field">${glyph('plus')}<input class="g-input" placeholder="Add item, e.g. 2 kg rice" enterkeyhint="done" autocapitalize="sentences" autocomplete="off" aria-label="Add an item"></label><div class="g-sugg" hidden></div></div>
      <div class="g-list">${gListHtml()}</div>`;
    return page({ title: 'Groceries', back: 'Planner', right: navBtn('g-menu', 'more', 'More'), body, sub: `<span class="g-sub">${gSub()}</span>` });
  },
  mount(el) {
    const input = $('.g-input', el), sugg = $('.g-sugg', el);
    const paintSugg = () => {
      const q = normApos(input.value.trim());
      if (q.length < 1) { sugg.hidden = true; return; }
      const open = new Set(S.grocery.items.filter((i) => !i.done).map((i) => normApos(i.name)));
      const m = Object.entries(S.grocery.known).filter(([k]) => !open.has(k) && k.includes(q)).map(([, v]) => v)
        .sort((a, b) => (normApos(a.name).startsWith(q) ? 0 : 1) - (normApos(b.name).startsWith(q) ? 0 : 1) || b.n - a.n).slice(0, 5);
      sugg.innerHTML = m.map((k) => `<button data-act="g-sugg" data-v="${esc(k.name)}">${tile(secOf(k.sec).g, secOf(k.sec).c)}<span>${esc(k.name)}</span><small>${esc(secOf(k.sec).name)}</small></button>`).join('');
      sugg.hidden = !m.length;
    };
    input.addEventListener('input', paintSugg);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) { input.blur(); return; }
      const it = addGrocery(v);
      input.value = '';
      sugg.hidden = true;
      refreshGroceries(el, it);
    });
    input.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 150));
    sugg.addEventListener('mousedown', (e) => e.preventDefault());
  },
  fab: () => ({ g: 'plus', act: 'g-focus', label: 'Add item' }),
};
function refreshGroceries(el, flashItem) {
  $('.g-list', el).innerHTML = gListHtml();
  const sub = $('.g-sub', el);
  if (sub) sub.textContent = gSub();
  if (flashItem) {
    const row = $(`[data-gid="${flashItem.id}"]`, el);
    if (row) row.classList.add('flash');
  }
}
ACTIONS['g-focus'] = () => {
  const el = curEl(), i = $('.g-input', el);
  $('.scroll', el).scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  i.focus();
};
ACTIONS['g-sugg'] = (el) => {
  const screen = curEl(), input = $('.g-input', screen);
  const it = addGrocery(el.dataset.v);
  input.value = '';
  $('.g-sugg', screen).hidden = true;
  refreshGroceries(screen, it);
  input.focus();
};
ACTIONS['g-again'] = (el) => {
  const it = addGrocery(el.dataset.v);
  buzz();
  refreshGroceries(curEl(), it);
};
let gTickT = 0;
ACTIONS['g-toggle'] = (el) => {
  const i = S.grocery.items.find((x) => x.id === el.dataset.id);
  if (!i) return;
  i.done = !i.done;
  i.doneAt = i.done ? Date.now() : 0;
  save();
  buzz();
  el.closest('.task').classList.toggle('ticked', i.done);
  clearTimeout(gTickT);
  gTickT = setTimeout(() => { if (cur().s === 'groceries') refreshGroceries(curEl()); }, 700);
};
ACTIONS['g-del'] = (el) => {
  const idx = S.grocery.items.findIndex((x) => x.id === el.dataset.id);
  if (idx < 0) return;
  const [it] = S.grocery.items.splice(idx, 1);
  save();
  refreshGroceries(curEl());
  undoToast(`${it.name} removed`, () => S.grocery.items.splice(idx, 0, it));
};
ACTIONS['g-clear'] = () => {
  const done = S.grocery.items.filter((i) => i.done);
  S.grocery.items = S.grocery.items.filter((i) => !i.done);
  save();
  refreshGroceries(curEl());
  undoToast(`Cleared ${plural(done.length, 'item')}`, () => S.grocery.items.push(...done));
};
ACTIONS['g-menu'] = async (el) => {
  const v = await menu(el, [
    { id: 'uncheck', label: 'Uncheck All', g: 'checkCircle' },
    { id: 'clear', label: 'Clear In Cart', g: 'cart' },
    '-',
    { id: 'all', label: 'Delete All Items', g: 'trash', danger: true },
    { id: 'forget', label: 'Forget “Buy again” Items', g: 'x', danger: true },
  ]);
  if (v === 'uncheck') { S.grocery.items.forEach((i) => { i.done = false; }); save(); render(); }
  if (v === 'clear') ACTIONS['g-clear']();
  if (v === 'all' && S.grocery.items.length && (await ask({ title: `Delete all ${plural(S.grocery.items.length, 'item')}?`, ok: 'Delete All', destructive: true }))) {
    S.grocery.items = [];
    save();
    render();
  }
  if (v === 'forget' && (await ask({ title: 'Forget all remembered items?', msg: 'The “Buy again” suggestions and the sections you chose for items will be cleared.', ok: 'Forget', destructive: true }))) {
    S.grocery.known = {};
    save();
    render();
  }
};

// ---------- Edit an item ----------
let GS = null;
ACTIONS['g-edit'] = (el) => {
  const i = S.grocery.items.find((x) => x.id === el.dataset.id);
  if (!i) return;
  GS = { ...i };
  openSheet(gSheetHtml(), mountGSheet);
};
function gSheetHtml() {
  return `${sheetHead('Item', '<button data-act="close-sheet">Cancel</button>', `<button class="strong" data-act="g-save" ${GS.name.trim() ? '' : 'disabled'}>Done</button>`)}
    <div class="sheet-body">
      <div class="card form"><input name="gname" value="${esc(GS.name)}" placeholder="Name" maxlength="60" autocapitalize="sentences" enterkeyhint="done"><input name="gqty" value="${esc(GS.qty)}" placeholder="Amount (e.g. 2 kg, 3 pcs)" maxlength="30" enterkeyhint="done"></div>
      <h2 class="sec">Section</h2>
      <div class="card pad"><div class="sec-grid">${SECTIONS.map((s) => `<button class="${secOf(GS.sec).id === s.id ? 'on' : ''}" data-act="g-sec" data-v="${s.id}" style="--c:${s.c}">${tile(s.g, s.c)}<span>${esc(s.name)}</span></button>`).join('')}</div></div>
      <button class="danger-btn" data-act="g-del-sheet">Delete Item</button>
    </div>`;
}
function mountGSheet(sh) {
  sh.addEventListener('input', (e) => {
    if (e.target.name === 'gname') { GS.name = e.target.value; $('[data-act="g-save"]', sh).disabled = !GS.name.trim(); }
    if (e.target.name === 'gqty') GS.qty = e.target.value;
  });
  blurOnEnter(sh);
}
ACTIONS['g-sec'] = (el) => { GS.sec = el.dataset.v; refreshSheet(gSheetHtml(), mountGSheet); };
ACTIONS['g-save'] = () => {
  const i = S.grocery.items.find((x) => x.id === GS.id);
  if (!i || !GS.name.trim()) { closeSheet(); return; }
  i.name = GS.name.trim();
  i.qty = GS.qty.trim();
  i.sec = GS.sec;
  const low = normApos(i.name), k = S.grocery.known[low];
  S.grocery.known[low] = { name: i.name, sec: i.sec, n: k ? k.n : 1, last: Date.now() };
  save();
  closeSheet();
  render();
};
ACTIONS['g-del-sheet'] = () => { const id = GS.id; closeSheet(); ACTIONS['g-del']({ dataset: { id } }); };
ACTIONS['open-groceries'] = () => push({ s: 'groceries' });
