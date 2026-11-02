import {NativeModules} from 'react-native';
import {hasDurableDelivery, reconcileReminderAlarms, holdNativeDelivery, finishNativeIncomingCall, isCurrentNativeCall} from '../../src/scheduler/reminderAlarm';
import {deliveryStore,deliveryIdentityKey} from '../../src/storage/deliveryStore';

describe('durable Android delivery bridge', () => {
  afterEach(() => { delete NativeModules.LafinaReminder; jest.restoreAllMocks(); });
  it('rejects late call events after reschedule, account change or deadline expiry', () => {
    NativeModules.LafinaReminder={reconcileDelivery:jest.fn(),scheduleExactAlarm:jest.fn()};
    const job={reminderId:'rem',userId:'owner',occurrenceKey:'occ',generation:1,state:'ringing' as const,triggerAt:new Date().toISOString(),deadlineAt:new Date(Date.now()+45_000).toISOString(),deliveryState:'posted',deliveryReason:null};
    const read=jest.spyOn(deliveryStore,'get').mockReturnValue(job);
    const event={reminderId:'rem',userId:'owner',task:'Synthetic reminder',action:'call' as const,deliveryKey:deliveryIdentityKey(job,'due')};
    expect(isCurrentNativeCall(event,'owner')).toBe(true);
    expect(isCurrentNativeCall(event,'another')).toBe(false);
    read.mockReturnValue({...job,generation:2});
    expect(isCurrentNativeCall(event,'owner')).toBe(false);
    read.mockReturnValue({...job,deadlineAt:new Date(Date.now()-1).toISOString()});
    expect(isCurrentNativeCall(event,'owner')).toBe(false);
  });
  it('uses one native reconciliation even when no pending reminders are supplied', async () => {
    const reconcileDelivery=jest.fn().mockResolvedValue(true);
    NativeModules.LafinaReminder={reconcileDelivery,scheduleExactAlarm:jest.fn()};
    expect(hasDurableDelivery()).toBe(true);
    await reconcileReminderAlarms([]);
    expect(reconcileDelivery).toHaveBeenCalledTimes(1);
  });
  it('retains compatibility when the installed APK has no durable bridge', async () => {
    expect(hasDurableDelivery()).toBe(false);
    await expect(holdNativeDelivery('rem','identity')).resolves.toBe(true);
  });
  it('passes the captured identity through hold and notification cleanup', async () => {
    const holdDelivery=jest.fn().mockResolvedValue(false);
    const finishIncomingCall=jest.fn().mockResolvedValue(true);
    NativeModules.LafinaReminder={reconcileDelivery:jest.fn(),scheduleExactAlarm:jest.fn(),holdDelivery,finishIncomingCall};
    await expect(holdNativeDelivery('rem','old-key')).resolves.toBe(false);
    await finishNativeIncomingCall('rem','old-key');
    expect(holdDelivery).toHaveBeenCalledWith('rem','old-key');
    expect(finishIncomingCall).toHaveBeenCalledWith('rem','old-key');
  });
});
