import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, recovery, prediction, exportCalendar, shift, validate } from './engine';
import { normalizeImport } from './data';
import type { Settings } from './types';
const today='2026-10-15';
const base:Settings={raceName:'Test race',raceDate:'2027-04-25',goalMinutes:240,days:4,weeklyKm:30,longestKm:12,recentRaceKm:21.0975,recentRaceMinutes:110};
test('long lead times stay in base instead of compounding mileage',()=>{
  const {weeks}=generatePlan({...base,raceDate:'2027-10-24'},today);
  const bases=weeks.filter(w=>w.phase==='Base');
  assert.ok(bases.length>20);
  bases.forEach(w=>assert.ok(Math.abs(w.km-30)<0.3));
  const nonRace=weeks.slice(0,-1); assert.ok(nonRace.every(w=>w.km<=50));
  assert.ok(weeks.some(w=>w.phase==='Recovery week'));
  assert.equal(weeks.at(-1)?.phase,'Race week');
  for(const w of nonRace) assert.equal(w.sessions.filter(s=>s.km>0).length,4);
});
test('long runs stay capped and taper precedes exact race date',()=>{
  const {weeks}=generatePlan(base,today);
  for(const w of weeks) for(const s of w.sessions) if(s.kind==='Long run') {assert.ok(s.km<=30);assert.ok(s.km<=w.km*.41);}
  const race=weeks.flatMap(w=>w.sessions).filter(s=>s.kind==='Race');
  assert.equal(race.length,1);assert.equal(race[0].date,base.raceDate);assert.equal(race[0].km,42.195);
  assert.equal(weeks.at(-2)?.phase,'Taper');
  assert.ok(weeks.at(-2)!.km<weeks.at(-4)!.km);
});
test('midweek race has no postrace training and no second race',()=>{
  const {weeks}=generatePlan({...base,raceDate:'2027-04-21'},today);
  for(const s of weeks.at(-1)!.sessions) if(s.date>'2027-04-21') assert.equal(s.km,0);
});
test('invalid and expired inputs fail and short lead time is visible',()=>{
  for(const change of [{days:7},{weeklyKm:0},{longestKm:40},{goalMinutes:NaN},{raceDate:'2026-02-30'},{raceDate:'2026-10-14'}]) assert.throws(()=>generatePlan({...base,...change},today));
  assert.throws(()=>generatePlan({...base,raceDate:'2030-01-01'},today));
  assert.ok(generatePlan({...base,raceDate:shift(today,10)},today).warnings.length);
  assert.ok(validate({...base,recentRaceKm:0},today).length);
});
test('missing, stale and future recovery never invent readiness',()=>{
  assert.equal(recovery(undefined,today).factor,1);
  assert.equal(recovery({date:'2026-10-01',sleepHours:3},today).factor,1);
  assert.equal(recovery({date:'2026-10-16',sleepHours:3},today).factor,1);
  assert.equal(recovery({date:today},today).label,'No recent signals');
});
test('poor sleep or baseline HRV adds explicit conservative adjustment',()=>{
  const r=recovery({date:today,sleepHours:5,hrvMs:38,hrvBaselineLow:45},today);
  assert.equal(r.factor,.8);assert.equal(r.reasons.length,2);
  assert.equal(recovery({date:today,hrvMs:38},today).factor,1);
  assert.equal(recovery({date:today,hrvMs:90,hrvBaselineHigh:60},today).factor,.8);
});
test('predictions use races, never an easy training run',()=>{
  const s={...base,recentRaceKm:0,recentRaceMinutes:0};
  const run={id:'1',date:today,name:'Easy run',distanceKm:10,durationSec:3600};
  assert.equal(prediction(s,{runs:[run],wellness:[]}),null);
  assert.ok(prediction(s,{runs:[{...run,race:true}],wellness:[]})!.minutes>250);
  assert.equal(Math.round(prediction(base,{runs:[],wellness:[]})!.minutes),229);
});
test('calendar uses real dates and stable unique ids',()=>{
  const plan=generatePlan(base,today); const cal=exportCalendar(plan.weeks);
  assert.ok(cal.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(cal.includes('DTSTART;VALUE=DATE:20270425'));
  const ids=cal.match(/^UID:.+$/gm)!;assert.equal(new Set(ids).size,ids.length);
  assert.equal((cal.match(/BEGIN:VEVENT/g)||[]).length,plan.weeks.flatMap(w=>w.sessions).filter(s=>s.km>0).length);
});
test('imports reject malformed and nonfinite data and deduplicate ids',()=>{
  assert.throws(()=>normalizeImport({runs:[{date:today,distanceKm:NaN,durationSec:12}],wellness:[]}));
  assert.throws(()=>normalizeImport({runs:[],wellness:[{date:today,sleepHours:30}]}));
  assert.throws(()=>normalizeImport({runs:[],wellness:[{date:'2026-02-30'}]}));
  const r={id:'x',date:today,name:'Run',distanceKm:5,durationSec:1800};
  assert.equal(normalizeImport({runs:[r,r],wellness:[]}).runs.length,1);
});
