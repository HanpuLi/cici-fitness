(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function targetRange(duration) {
    const d = Number(duration) || 60;
    if (d <= 30) return { min: 3, max: 4 };
    if (d <= 45) return { min: 4, max: 5 };
    if (d <= 60) return { min: 5, max: 6 };
    if (d <= 75) return { min: 5, max: 7 };
    return { min: 6, max: 8 };
  }

  function estimateStrengthExerciseMinutes(sets = 3, restSec = 45, secondsPerSet = 45) {
    const s = Math.max(1, Number(sets) || 1);
    const rest = Math.max(0, Number(restSec) || 0);
    const work = Math.max(20, Number(secondsPerSet) || 45) * s / 60;
    const betweenSets = Math.max(0, s - 1) * rest / 60;
    return work + betweenSets;
  }

  function createSessionBudget(options = {}) {
    const duration = clamp(Number(options.duration) || 60, 20, 180);
    const sets = clamp(Number(options.sets) || 3, 1, 8);
    const rawRestSec = Number(options.restSec);
    const restSec = clamp(Number.isFinite(rawRestSec) ? rawRestSec : 45, 0, 240);
    const cardioFocus = !!options.cardioFocus;
    const noEquipmentOnly = !!options.noEquipmentOnly;

    const warmup = duration <= 30 ? 4 : duration <= 45 ? 5 : 6;
    const cooldown = duration <= 30 ? 3 : duration <= 60 ? 5 : 6;
    const transitions = duration <= 30 ? 2 : duration <= 60 ? 3 : 4;
    let conditioning = cardioFocus
      ? clamp(Math.round(duration * 0.22), 6, 20)
      : (duration >= 60 ? 8 : duration >= 45 ? 6 : duration >= 30 ? 3 : 0);

    const highImpactMax = noEquipmentOnly ? Math.min(5, conditioning) : 0;
    const strength = Math.max(0, duration - warmup - conditioning - cooldown - transitions);
    const perStrengthExercise = estimateStrengthExerciseMinutes(sets, restSec);
    const range = targetRange(duration);
    const fitsByTime = Math.max(1, Math.floor((strength + 0.001) / perStrengthExercise));
    let mainTarget = Math.min(range.max, fitsByTime);
    if (mainTarget < range.min && range.min * perStrengthExercise <= strength + 5) {
      mainTarget = range.min;
    }

    let estimatedTotal = warmup + conditioning + cooldown + transitions + mainTarget * perStrengthExercise;
    while (mainTarget > 1 && estimatedTotal > duration + 5) {
      mainTarget -= 1;
      estimatedTotal = warmup + conditioning + cooldown + transitions + mainTarget * perStrengthExercise;
    }

    return {
      duration,
      warmup,
      mainStrength: strength,
      conditioning,
      cooldown,
      transitions,
      sets,
      restSec,
      mainMin: range.min,
      mainMax: range.max,
      mainTarget,
      highImpactMax,
      estimatedTotal: Math.round(estimatedTotal * 10) / 10
    };
  }

  function isMainStrength(ex) {
    if (!ex || ex.isWarmup || ex.isStretch) return false;
    return !['warmup', 'stretch', 'cardio', 'posture', 'swimming'].includes(ex.group);
  }

  function isHighImpactCardio(ex) {
    if (!ex) return false;
    const name = String(ex.name || '');
    return /波比|开合跳|跳绳|跳跃/.test(name);
  }

  function estimateExerciseMinutes(ex, restSec = 45) {
    if (!ex) return 0;
    const sets = Math.max(1, Number(ex.sets) || 1);
    const reps = Math.max(0, Number(ex.reps) || 0);
    if (ex.unit === '分钟') return reps * sets;
    if (ex.unit === '秒') return reps * sets / 60;
    const workSeconds = clamp(reps * 3.5, 25, 70);
    return estimateStrengthExerciseMinutes(sets, restSec, workSeconds);
  }

  function estimatePlanMinutes(exercises, options = {}) {
    const list = Array.isArray(exercises) ? exercises : [];
    const rawRestSec = Number(options.restSec);
    const restSec = Number.isFinite(rawRestSec) ? rawRestSec : 45;
    const transitionPerExercise = options.transitionPerExercise == null ? 0.25 : Number(options.transitionPerExercise);
    const transition = Math.max(0, list.length - 1) * Math.max(0, transitionPerExercise);
    const work = list.reduce((sum, ex) => sum + estimateExerciseMinutes(ex, restSec), 0);
    return Math.round((work + transition) * 10) / 10;
  }

  function overlapScore(a, b) {
    const aa = new Set((a && a.muscle) || []);
    const bb = new Set((b && b.muscle) || []);
    if (!aa.size || !bb.size) return 0;
    let shared = 0;
    aa.forEach(m => { if (bb.has(m)) shared += 1; });
    return shared / Math.max(aa.size, bb.size);
  }

  function spreadMainExercises(list) {
    const remaining = [...list];
    const out = [];
    while (remaining.length) {
      if (!out.length) {
        out.push(remaining.shift());
        continue;
      }
      const prev = out[out.length - 1];
      let best = 0;
      let bestScore = overlapScore(prev, remaining[0]);
      for (let i = 1; i < remaining.length; i += 1) {
        const score = overlapScore(prev, remaining[i]);
        if (score < bestScore) {
          best = i;
          bestScore = score;
          if (score === 0) break;
        }
      }
      out.push(remaining.splice(best, 1)[0]);
    }
    return out;
  }

  function fitExercisesToBudget(exercises, budget, options = {}) {
    const list = Array.isArray(exercises) ? exercises : [];
    const b = budget || createSessionBudget(options);
    const keepPredicate = typeof options.keepPredicate === 'function' ? options.keepPredicate : () => false;
    const required = list.filter(keepPredicate);
    const requiredSet = new Set(required);

    const requiredMain = required.filter(isMainStrength);
    const mainSlots = Math.max(0, b.mainTarget - requiredMain.length);
    const otherMain = spreadMainExercises(list.filter(ex => isMainStrength(ex) && !requiredSet.has(ex))).slice(0, mainSlots);
    const main = [...requiredMain, ...otherMain];

    const requiredWarm = required.filter(ex => ex && (ex.isWarmup || ex.group === 'warmup'));
    const warmSlots = Math.max(0, (b.duration <= 30 ? 2 : 3) - requiredWarm.length);
    const warmup = [...requiredWarm, ...list.filter(ex => ex && (ex.isWarmup || ex.group === 'warmup') && !requiredSet.has(ex)).slice(0, warmSlots)];

    const cooldownLimit = options.flexibilityFocus ? 4 : (b.duration <= 30 ? 2 : 3);
    const requiredCool = required.filter(ex => ex && (ex.isStretch || ex.group === 'stretch' || ex.group === 'posture'));
    const coolSlots = Math.max(0, cooldownLimit - requiredCool.length);
    const cooldown = [...requiredCool, ...list.filter(ex => ex && (ex.isStretch || ex.group === 'stretch' || ex.group === 'posture') && !requiredSet.has(ex)).slice(0, coolSlots)];

    const replacement = new Map();
    let conditioning = list.filter(ex => ex && ex.group === 'cardio').map(ex => {
      let out = ex;
      if (isHighImpactCardio(ex)) {
        const minutes = Math.min(5, b.highImpactMax || 0, Number(ex.reps) || 0);
        out = { ...ex, reps: Math.max(0, minutes), optional: true };
      } else if (ex.unit === '分钟') {
        out = { ...ex, reps: Math.min(Number(ex.reps) || b.conditioning, b.conditioning) };
      }
      replacement.set(ex, out);
      return out;
    }).filter(ex => !isHighImpactCardio(ex) || ex.reps > 0).slice(0, 1);

    const selectedOriginals = new Set([...warmup, ...main, ...cooldown]);
    for (const [orig, repl] of replacement.entries()) {
      if (conditioning.includes(repl)) selectedOriginals.add(orig);
    }
    required.forEach(ex => selectedOriginals.add(ex));
    let fitted = list.filter(ex => selectedOriginals.has(ex)).map(ex => replacement.get(ex) || ex);

    const maxMinutes = b.duration + 5;
    const removablePriority = ex => {
      if (ex && (ex.isStretch || ex.group === 'stretch' || ex.group === 'posture')) return 0;
      if (ex && ex.group === 'cardio') return 1;
      if (isMainStrength(ex)) return 2;
      if (ex && (ex.isWarmup || ex.group === 'warmup')) return 3;
      return 4;
    };

    while (fitted.length && estimatePlanMinutes(fitted, { restSec: b.restSec }) > maxMinutes) {
      const mainCount = fitted.filter(isMainStrength).length;
      let idx = -1;
      let bestPriority = Infinity;
      for (let i = fitted.length - 1; i >= 0; i -= 1) {
        const ex = fitted[i];
        if (keepPredicate(ex)) continue;
        const priority = removablePriority(ex);
        if (isMainStrength(ex) && mainCount <= Math.min(b.mainMin, b.mainTarget)) continue;
        if ((ex.isWarmup || ex.group === 'warmup') && fitted.filter(x => x && (x.isWarmup || x.group === 'warmup')).length <= 1) continue;
        if (priority < bestPriority) {
          idx = i;
          bestPriority = priority;
        }
      }
      if (idx < 0) break;
      fitted.splice(idx, 1);
    }

    return {
      exercises: fitted,
      estimatedMinutes: estimatePlanMinutes(fitted, { restSec: b.restSec }),
      mainCount: fitted.filter(isMainStrength).length
    };
  }

  const api = {
    targetRange,
    estimateStrengthExerciseMinutes,
    createSessionBudget,
    estimateExerciseMinutes,
    estimatePlanMinutes,
    isMainStrength,
    isHighImpactCardio,
    spreadMainExercises,
    fitExercisesToBudget
  };

  root.TrainingModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
