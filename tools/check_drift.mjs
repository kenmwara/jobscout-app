#!/usr/bin/env node
/**
 * check_drift.mjs — the same résumé gets the same verdict on the phone and the web.
 *
 * Ken, 2026-09-30: "There's a mobile vs web drift - she was on her phone and I was on
 * web, same cv but different results". Two causes, two guards:
 *   1  /api/score ran at the API's default temperature (1.0): the same CV on the same
 *      eight postings moved 3 of 8 fits. scoreOne now pins temperature 0; measured live
 *      on 1 Oct, 39 of 40 fits identical over five runs (one moved 28 -> 38).
 *   2  she pasted, he uploaded, so the words differed. Both surfaces now lead with the
 *      file ("Attach"), which reads the same on every device.
 * The live measurement is not repeated per deploy: it costs model calls against the
 * hourly cap. This guards the two causes in the source.
 *
 *   node tools/check_drift.mjs [--mutate temp | paste-first]
 */
import { readFileSync } from "node:fs";
const MUTATE = process.argv.includes("--mutate") ? process.argv[process.argv.indexOf("--mutate") + 1] : null;
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };
let worker = readFileSync("worker/src/index.js", "utf8");
let mobile = readFileSync("android/app/src/main/java/trade/tbot/jobscout/Mobile.kt", "utf8");
if (MUTATE === "temp") worker = worker.replace(/temperature:\s*0(?![.\d])/, "temperature: 1");
if (MUTATE === "paste-first") mobile = mobile.replace('"Attach your résumé, or paste it"', '"Paste or drop your résumé"');
const fails = [];
const check = (ok, what) => { say(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) fails.push(what); };
const i = worker.indexOf("async function scoreOne");
const body = i < 0 ? "" : worker.slice(i, worker.indexOf("\n}\n", i));
check(/temperature:\s*0(?![.\d])/.test(body), "1  scoreOne pins temperature 0 (the same CV scores the same)");
check(mobile.includes('"Attach your résumé, or paste it"') && /else "Attach"/.test(mobile), "2  the phone's résumé bar leads with Attach, on the empty bar too");
say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS — scoring pinned, the phone leads with the file");
process.exitCode = fails.length ? 1 : 0;
