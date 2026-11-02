import type {NluResult, ScheduleApplicationResult} from './types';
/** Legacy inference adapter: proposals never write. Only a reviewed command session can save. */
export const applyNluScheduleResult = (result: NluResult, _userId: string, _referenceDate: Date = new Date()): ScheduleApplicationResult => ({
  didUpdate: false, createdItemType: null,
  reply: result.intent === 'schedule' ? `Review “${result.task ?? 'the proposed schedule'}” and choose Confirm before saving.` : result.reply,
});
