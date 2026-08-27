(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MiDineroParser=api;
})(typeof self!=='undefined'?self:this,function(){
  const CATEGORY_RULES = [
    ['Nómina',/n[oó]mina|salario|payroll|sueldo/i],
    ['Alimentación',/mercadona|carrefour|lidl|aldi|eroski|gadisa|gadis|froiz|alcampo|supermerc|alimentaci[oó]n|restaurante|caf[eé]|bar\b|burger|mcdonald|glovo|just eat|uber eats|deliveroo/i],
    ['Transporte',/repsol|cepsa|galp|bp\b|gasolina|combustible|parking|aparcamiento|renfe|metro|autob[uú]s|bus\b|taxi|uber|cabify|peaje/i],
    ['Vivienda',/alquiler|hipoteca|comunidad|electricidad|iberdrola|naturgy|endesa|agua\b|internet|fibra|muebles|ikea/i],
    ['Suscripciones',/netflix|spotify|hbo|disney|amazon prime|suscripci[oó]n|cuota mensual|google one|icloud|adobe/i],
    ['Salud',/farmacia|m[eé]dico|dentista|fisioterapia|fisioterapeuta|hospital|sanitas|adeslas|gimnasio/i],
    ['Viajes',/hotel|booking|airbnb|ryanair|iberia|vueling|volotea|air europa|vuelo|aeropuerto/i],
    ['Compras',/zara|pull.?bear|bershka|stradivarius|massimo dutti|amazon|aliexpress|decathlon|primark|tienda|compra online/i],
    ['Inversión',/dividendo|reembolso|inter[eé]s|fondo de inversi[oó]n|broker|myinvestor/i]
  ];
  const MERCHANTS = ['Mercadona','Carrefour','Lidl','Aldi','Eroski','Gadis','Froiz','Alcampo','Amazon','Zara','Pull&Bear','Bershka','Stradivarius','Massimo Dutti','Repsol','Cepsa','Galp','Iberdrola','Naturgy','Endesa','Netflix','Spotify','Booking','Airbnb','Ryanair','Iberia','Vueling','Volotea','Air Europa','Uber','Cabify','Glovo','Decathlon','Primark','MyInvestor'];
  const clean = value => String(value||'').replace(/[\t ]+/g,' ').replace(/\r/g,'').trim();

  function normalizeAmount(raw){
    let value=String(raw).replace(/[^\d.,-]/g,'').replace(/^-/,'');
    const lastComma=value.lastIndexOf(','),lastDot=value.lastIndexOf('.');
    if(lastComma>lastDot)value=value.replace(/\./g,'').replace(',','.');
    else if(lastDot>lastComma)value=value.replace(/,/g,'');
    return Number(value);
  }
  function findAmount(text){
    const lines=text.split('\n').map(clean).filter(Boolean),candidates=[];
    lines.forEach((line,index)=>{
      const matches=[...line.matchAll(/(?:EUR|€)?\s*(-?\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{2}))(?:\s*(?:EUR|€))?|(?:EUR|€)\s*(-?\d{1,6})|-?(\d{1,6})\s*(?:EUR|€)/gi)];
      matches.forEach(match=>{
        const amount=normalizeAmount(match[1]||match[2]||match[3]);if(!amount||amount>1000000)return;
        let score=index/Math.max(lines.length,1);
        if(/\b(total|importe|pagado|cargo|operaci[oó]n|payment|amount)\b/i.test(line))score+=8;
        if(/\b(a pagar|precio final|total compra)\b/i.test(line))score+=5;
        if(/\b(base|iva|impuesto|tax|descuento|cambio|ahorro|subtotal)\b/i.test(line))score-=5;
        if(/[€]|\bEUR\b/i.test(line))score+=2;
        candidates.push({amount,score});
      });
    });
    return candidates.sort((a,b)=>b.score-a.score||b.amount-a.amount)[0]?.amount||0;
  }
  function isoDate(year,month,day){
    const date=new Date(year,month-1,day);if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function findDate(text,now=new Date()){
    if(/\bayer\b/i.test(text)){const d=new Date(now);d.setDate(d.getDate()-1);return d.toISOString().slice(0,10)}
    if(/\bhoy\b/i.test(text))return now.toISOString().slice(0,10);
    let match=text.match(/\b(20\d{2})[\/.\-](0?[1-9]|1[0-2])[\/.\-]([0-2]?\d|3[01])\b/);
    if(match)return isoDate(+match[1],+match[2],+match[3]);
    match=text.match(/\b([0-2]?\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-](\d{2,4})\b/);
    if(match){let year=+match[3];if(year<100)year+=2000;return isoDate(year,+match[2],+match[1])}
    return now.toISOString().slice(0,10);
  }
  function findType(text){
    if(/\b(ingreso|abono|n[oó]mina|salario|sueldo|transferencia recibida|devoluci[oó]n|reembolso|cobro|dividendo)\b/i.test(text))return'income';
    return'expense';
  }
  function findCategory(text,type){
    const found=CATEGORY_RULES.find(([,rule])=>rule.test(text))?.[0];
    if(type==='income')return ['Nómina','Inversión'].includes(found)?found:(/dividendo|inter[eé]s|inversi[oó]n/i.test(text)?'Inversión':'Otros');
    return found&&!['Nómina','Inversión'].includes(found)?found:'Otros';
  }
  function findAccount(text){
    if(/revolut/i.test(text))return'Revolut';
    if(/efectivo|cash/i.test(text))return'Efectivo';
    if(/tarjeta.{0,12}(cr[eé]dito|aplazad)|credit card/i.test(text))return'Tarjeta crédito';
    return'Cuenta principal';
  }
  function findConcept(text,type,category){
    const merchant=MERCHANTS.find(name=>new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(text));
    if(merchant)return merchant;
    if(type==='income'&&category==='Nómina')return'Nómina';
    const sentence=clean(text.replace(/\b(hoy|ayer)\b/gi,'').replace(/(?:EUR|€)?\s*-?\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{2})(?:\s*(?:EUR|€))?|(?:EUR|€)\s*-?\d{1,6}|-?\d{1,6}\s*(?:EUR|€)/gi,'').replace(/\b(gast[eé]|pagu[eé]|compra|ingreso|abono|con|desde|mediante|por)\b/gi,' '));
    const lines=sentence.split('\n').map(clean).filter(line=>line.length>2&&!/^(total|fecha|importe|gracias|ticket|factura|copia)/i.test(line));
    return (lines[0]||category).slice(0,60);
  }
  function parseMovementText(rawText,now=new Date()){
    const text=clean(rawText).replace(/\n{3,}/g,'\n\n');
    const type=findType(text),category=findCategory(text,type),amount=findAmount(text),concept=findConcept(text,type,category);
    return {type,amount,concept,date:findDate(text,now),category,account:findAccount(text),nature:/alquiler|hipoteca|comunidad|suscripci[oó]n|cuota mensual|n[oó]mina|seguro|internet|fibra|netflix|spotify/i.test(text)?'fixed':'variable',note:'Reconocido automáticamente',confidence:Math.min(100,(amount?45:0)+(category!=='Otros'?25:0)+(/\d{1,2}[\/.\-]\d{1,2}/.test(text)||/\b(hoy|ayer)\b/i.test(text)?15:0)+(concept!==category?15:0)),rawText:text};
  }
  return {parseMovementText,normalizeAmount};
});
