import { describe, it, expect } from 'vitest';
import { runJq, JqError } from './jq';

// [query, input, expected outputs | 'ERR']. Every non-ERR expectation was compared with jq 1.7 output. 'ERR' rows are
// either real jq errors (`.a[]` on a number) or syntax the subset rejects on purpose (`|=`, `@base64`, getpath …).
const cases: [string, unknown, unknown][] = [
  ['.', {a:1}, [{a:1}]],
  ['.a.b', {a:{b:2}}, [2]],
  ['.items[0].id', {items:[{id:7}]}, [7]],
  ['.items[] | .id', {items:[{id:1},{id:2}]}, [1,2]],
  ['[.items[] | select(.n > 1) | .id]', {items:[{id:1,n:1},{id:2,n:5}]}, [[2]]],
  ['{total: (.items | length), names: [.items[].name]}', {items:[{name:'a'},{name:'b'}]}, [{total:2,names:['a','b']}]],
  ['.a // "dflt"', {}, ['dflt']],
  ['if .x > 3 then "big" elif .x > 1 then "mid" else "small" end', {x:2}, ['mid']],
  ['"id-\\(.id)"', {id:5}, ['id-5']],
  ['.items | map(.price * .qty) | add', {items:[{price:2,qty:3},{price:1,qty:4}]}, [10]],
  ['.list | sort_by(.k) | .[0].k', {list:[{k:3},{k:1}]}, [1]],
  ['.list | group_by(.t) | map({t: .[0].t, n: length})', {list:[{t:'a'},{t:'b'},{t:'a'}]}, [[{t:'a',n:2},{t:'b',n:1}]]],
  ['to_entries | map(select(.value != null)) | from_entries', {a:1,b:null}, [{a:1}]],
  ['.a as $x | .b + $x', {a:1,b:2}, [3]],
  ['reduce .xs[] as $i (0; . + $i)', {xs:[1,2,3]}, [6]],
  ['.s | split(",") | join("-")', {s:'a,b'}, ['a-b']],
  ['.s | test("^ab")', {s:'abc'}, [true]],
  ['.x? // "none"', 'str', ['none']],
  ['[.[] | tostring]', [1,'a',null], [['1','a','null']]],
  ['.a, .b', {a:1,b:2}, [1,2]],
  ['.a == 1 and .b != 2', {a:1,b:3}, [true]],
  ['keys', {b:1,a:2}, [['a','b']]],
  ['.["my-key"]', {'my-key':4}, [4]],
  ['.arr[1:]', {arr:[1,2,3]}, [[2,3]]],
  ['{(.k): .v}', {k:'x',v:1}, [{x:1}]],
  ['.a |= 1', {}, 'ERR'],
  ['@base64', {}, 'ERR'],
  ['getpath(["a"])', {}, 'ERR'],
  ['.a.b.c', {a:null}, [null]],
  ['.a[]', {a:5}, 'ERR'],
  ['unique', [3,1,3], [[1,3]]],
  ['min_by(.n) | .n', [{n:3},{n:1}], [1]],
  ['[limit(2; .[])]', [1,2,3], [[1,2]]],
  ['with_entries(.value += 1)', {a:1}, 'ERR'],
  ['with_entries({key: .key, value: (.value + 1)})', {a:1}, [{a:2}]],
  ['.n | tonumber', {n:'42'}, [42]],
  ['. * {b:{c:2}}', {b:{d:1}}, [{b:{d:1,c:2}}]],
];

describe('sandbox jq subset', () => {
    it.each(cases)('%s', (query, input, expected) => {
        if (expected === 'ERR') {
            expect(() => runJq(query, input)).toThrow(JqError);
        } else {
            expect(runJq(query, input)).toEqual(expected);
        }
    });

    it('says which syntax is unsupported instead of guessing', () => {
        expect(() => runJq('.a |= 1', {})).toThrow(/不支持/);
        expect(() => runJq('getpath(["a"])', {})).toThrow(/不支持 getpath/);
    });
});
