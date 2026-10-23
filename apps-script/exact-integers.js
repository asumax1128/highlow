// Apps Script's parser does not accept BigInt numeric literals.
// These games use bounded integers. Every multiplication is checked BEFORE use;
// unsupported future templates fail closed rather than silently rounding.
function hlExactProduct(values){let result=1;for(const value of values){if(!Number.isSafeInteger(value)||value<0)throw Error('Unsafe exact integer');if(value!==0&&result>Math.floor(Number.MAX_SAFE_INTEGER/value))throw Error('Exact integer product exceeds supported range');result*=value;if(!Number.isSafeInteger(result))throw Error('Unsafe exact integer product')}return result}
function hlCompareValues(a,b){const x=hlExactProduct([a.n,a.n,a.rad,b.d,b.d]),y=hlExactProduct([b.n,b.n,b.rad,a.d,a.d]);return x===y?'EQUAL':x>y?'LEFT':'RIGHT'}
function hlCompareRecords(a,b){if(a.score!==b.score)return a.score>b.score?-1:1;const aa=a.answers||1,ba=b.answers||1,x=hlExactProduct([a.correct,ba]),y=hlExactProduct([b.correct,aa]);if(x!==y)return x>y?-1:1;if(!a.answers||!b.answers){if(a.answers!==b.answers)return a.answers?-1:1;return 0}const left=hlExactProduct([a.responseUs,ba]),right=hlExactProduct([b.responseUs,aa]);return left<right?-1:left>right?1:0}
