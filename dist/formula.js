const MATH_NS='http://www.w3.org/1998/Math/MathML';
function element(tag,text,...children){const node=document.createElementNS(MATH_NS,tag);if(text!==null)node.textContent=text;for(const child of children)node.append(child);return node}
function application(){const node=operator('\u2061');node.setAttribute('lspace','0.18em');node.setAttribute('rspace','0em');return node}
const number=text=>element('mn',text),operator=text=>element('mo',text),row=(...children)=>element('mrow',null,...children);
const digits='₀₁₂₃₄₅₆₇₈₉',powers='⁰¹²³⁴⁵⁶⁷⁸⁹';
function expression(text){let match;
 if((match=text.match(/^(\d+)\/(\d+)$/)))return element('mfrac',null,number(match[1]),number(match[2]));
 if((match=text.match(/^(\d+)?√(\d+)$/))){const root=element('msqrt',null,number(match[2]));return match[1]?row(number(match[1]),root):root}
 if((match=text.match(/^(sin|cos|tan) (\d+)°$/))){const name=element('mi',match[1]);name.setAttribute('mathvariant','normal');return row(name,application(),element('msup',null,number(match[2]),operator('°')))}
 if((match=text.match(/^log([₀₁₂₃₄₅₆₇₈₉]+) (\d+)$/))){const name=element('mi','log');name.setAttribute('mathvariant','normal');return row(element('msub',null,name,number([...match[1]].map(c=>digits.indexOf(c)).join(''))),application(),number(match[2]))}
 if((match=text.match(/^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)$/))){const power=[...match[2]].map(c=>c==='⁻'?'−':String(powers.indexOf(c))).join('');return element('msup',null,number(match[1]),power.startsWith('−')?row(operator('−'),number(power.slice(1))):number(power))}
 // Tokenize display-only text. Values and answer decisions stay in engine.js.
 const tokens=text.match(/\d+(?:\.\d+)?|[+−×÷|⋯]|\S/g)||[];
 return row(...tokens.map(t=>/^\d/.test(t)?number(t):/^[+−×÷|⋯]$/.test(t)?operator(t):element('mtext',t)));
}
export function fitFormula(container){const math=container?.querySelector('math');if(!math)return;container.style.removeProperty('font-size');const available=container.clientWidth;const base=parseFloat(getComputedStyle(container).fontSize);const actual=math.getBoundingClientRect().width;if(available>0&&actual>available)container.style.fontSize=Math.max(14,Math.floor(base*available/actual*0.97))+'px'}
export function renderFormula(container,text){if(container.dataset.expression===text)return;container.dataset.expression=text;const math=element('math',null,expression(text));math.setAttribute('display','inline');math.setAttribute('displaystyle','true');math.setAttribute('aria-label',text);container.replaceChildren(math);fitFormula(container)}
window.addEventListener('resize',()=>requestAnimationFrame(()=>document.querySelectorAll('.formula').forEach(fitFormula)));
