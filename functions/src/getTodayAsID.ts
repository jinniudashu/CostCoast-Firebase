/**
 * 返回当日日期用于ID
 * @return {string} 当日日期用于ID
 */
export const getTodayAsID = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return `${year}-${month}-${day}`;
};
