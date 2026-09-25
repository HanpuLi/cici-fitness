import test from 'node:test';
import assert from 'node:assert/strict';
import '../training-model.js';

const TM = globalThis.TrainingModel;

test('creates bounded budgets for 30/45/60/90 minute sessions', () => {
  for (const duration of [30, 45, 60, 90]) {
    const budget = TM.createSessionBudget({ duration, sets: 3, restSec: 45 });
    assert.equal(budget.duration, duration);
    assert.ok(budget.warmup > 0);
    assert.ok(budget.mainStrength > 0);
    assert.ok(budget.cooldown > 0);
    assert.ok(budget.transitions > 0);
    assert.ok(budget.estimatedTotal <= duration + 5, `${duration} minute budget overflowed`);
  }
});

test('default strength targets scale with session duration', () => {
  assert.ok(TM.createSessionBudget({ duration: 30, sets: 3, restSec: 45 }).mainTarget <= 4);
  assert.ok(TM.createSessionBudget({ duration: 45, sets: 3, restSec: 45 }).mainTarget <= 5);
  assert.ok(TM.createSessionBudget({ duration: 60, sets: 3, restSec: 45 }).mainTarget <= 6);
  assert.ok(TM.createSessionBudget({ duration: 90, sets: 3, restSec: 45 }).mainTarget <= 8);
});

test('high-impact cardio is only budgeted for no-equipment sessions and caps at five minutes', () => {
  const gym = TM.createSessionBudget({ duration: 60, noEquipmentOnly: false });
  const bodyweight = TM.createSessionBudget({ duration: 60, noEquipmentOnly: true });
  assert.equal(gym.highImpactMax, 0);
  assert.ok(bodyweight.highImpactMax <= 5);
  const result = TM.fitExercisesToBudget([
    { name: '波比跳', group: 'cardio', sets: 1, reps: 15, unit: '分钟', muscle: ['全身'] }
  ], bodyweight);
  assert.equal(result.exercises.length, 1);
  assert.ok(result.exercises[0].reps <= 5);
  assert.equal(result.exercises[0].optional, true);
});

test('fitted plans stay within duration plus five minutes', () => {
  for (const duration of [30, 45, 60, 90]) {
    const budget = TM.createSessionBudget({ duration, sets: 3, restSec: 45 });
    const exercises = [
      { name: '热身1', group: 'warmup', isWarmup: true, sets: 1, reps: 60, unit: '秒' },
      { name: '热身2', group: 'warmup', isWarmup: true, sets: 1, reps: 60, unit: '秒' },
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `力量${i + 1}`,
        group: i % 2 ? 'back' : 'quads',
        sets: 3,
        reps: 12,
        unit: '次',
        muscle: [i % 2 ? '背' : '腿']
      })),
      { name: '椭圆机', group: 'cardio', sets: 1, reps: 15, unit: '分钟', muscle: ['心肺'] },
      { name: '拉伸1', group: 'stretch', isStretch: true, sets: 1, reps: 45, unit: '秒' },
      { name: '拉伸2', group: 'stretch', isStretch: true, sets: 1, reps: 45, unit: '秒' },
      { name: '拉伸3', group: 'stretch', isStretch: true, sets: 1, reps: 45, unit: '秒' }
    ];
    const fitted = TM.fitExercisesToBudget(exercises, budget);
    assert.ok(fitted.estimatedMinutes <= duration + 5, `${duration} minute plan estimated at ${fitted.estimatedMinutes}`);
  }
});

test('default 60 minute plan never keeps more than six main strength exercises', () => {
  const budget = TM.createSessionBudget({ duration: 60, sets: 3, restSec: 45 });
  const result = TM.fitExercisesToBudget(
    Array.from({ length: 12 }, (_, i) => ({
      name: `动作${i + 1}`,
      group: i % 3 === 0 ? 'back' : i % 3 === 1 ? 'quads' : 'hamglutes',
      sets: 3,
      reps: 12,
      unit: '次',
      muscle: [`肌群${i % 3}`]
    })),
    budget
  );
  assert.ok(result.mainCount <= 6);
});
