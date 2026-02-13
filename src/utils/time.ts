import moment from 'moment';

export const msInMinute = 60000;
export const msInHour = 60 * msInMinute;

export function getStartTsByTf(ts: number, tf: number) {
  if (!ts) {
    return null;
  }
  const time = moment(ts).utc().valueOf();
  const res = Math.floor(time / (tf * msInMinute));
  return res * tf * msInMinute;
}

export function nowTs() {
  return moment().utc().valueOf();
}

export function startOfMinuteTs(ts?: number) {
  return moment(ts).utc().startOf('minute').valueOf();
}

export function startOfHourTs() {
  return moment().utc().startOf('hour').valueOf();
}

export function startOfHourAgoTs() {
  return moment().utc().subtract(1, 'hour').startOf('hour').valueOf();
}

export function startOfMonthTs() {
  return moment().utc().startOf('month').valueOf();
}
