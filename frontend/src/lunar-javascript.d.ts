declare module 'lunar-javascript' {
  export interface Solar {
    getLunar(): Lunar
    getYear(): number
    getMonth(): number
    getDay(): number
    getHour(): number
    getMinute(): number
    next(days: number): Solar
    nextYear(years: number): Solar
    nextMonth(months: number): Solar
    nextHour(hours: number): Solar
    subtract(other: Solar): number
    subtractMinute(other: Solar): number
    toYmdHms(): string
  }

  export interface Lunar {
    getYear(): number
    getMonth(): number
    getDay(): number
    getHour(): number
    getMinute(): number
    getSecond(): number
    getEightChar(): EightChar
    getYearInGanZhiExact(): string
    getYearGanExact(): string
    getYearZhiExact(): string
    getMonthInGanZhiExact(): string
    getMonthGanExact(): string
    getMonthZhiExact(): string
    getDayInGanZhiExact(): string
    getDayGanExact(): string
    getDayZhiExact(): string
    getDayInGanZhiExact2(): string
    getDayGanExact2(): string
    getDayZhiExact2(): string
    getTimeInGanZhi(): string
    getTimeGan(): string
    getTimeZhi(): string
    getYearInGanZhi(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getYearGanIndexExact(): number
    getYearZhiIndexExact(): number
    getMonthGanIndexExact(): number
    getMonthZhiIndexExact(): number
    getDayGanIndexExact(): number
    getDayZhiIndexExact(): number
    getDayGanIndexExact2(): number
    getDayZhiIndexExact2(): number
    getTimeZhiIndex(): number
    getYearXunKongExact(): string
    getMonthXunKongExact(): string
    getDayXunKongExact(): string
    getDayXunKongExact2(): string
    getTimeXunKong(): string
    getSolar(): Solar
    getPrevJie(): Lunar
    getNextJie(): Lunar
    getJieQiTable(): Record<string, Solar>
  }

  export interface EightChar {
    getYear(): string
    getYearGan(): string
    getYearZhi(): string
    getYearNaYin(): string
    getYearWuXing(): string
    getYearShiShenGan(): string
    getYearShiShenZhi(): string[]
    getYearHideGan(): string[]
    getYearDiShi(): string
    getYearXunKong(): string
    getMonth(): string
    getMonthGan(): string
    getMonthZhi(): string
    getMonthNaYin(): string
    getMonthWuXing(): string
    getMonthShiShenGan(): string
    getMonthShiShenZhi(): string[]
    getMonthHideGan(): string[]
    getMonthDiShi(): string
    getMonthXunKong(): string
    getDay(): string
    getDayGan(): string
    getDayZhi(): string
    getDayNaYin(): string
    getDayWuXing(): string
    getDayShiShenGan(): string
    getDayShiShenZhi(): string[]
    getDayHideGan(): string[]
    getDayDiShi(): string
    getDayXunKong(): string
    getTime(): string
    getTimeGan(): string
    getTimeZhi(): string
    getTimeNaYin(): string
    getTimeWuXing(): string
    getTimeShiShenGan(): string
    getTimeShiShenZhi(): string[]
    getTimeHideGan(): string[]
    getTimeDiShi(): string
    getTimeXunKong(): string
    getTaiYuan(): string
    getTaiXi(): string
    getMingGong(): string
    getShenGong(): string
    getLunar(): Lunar
    getYun(gender: number, sect?: number): Yun
  }

  export interface Yun {
    getStartYear(): number
    getStartMonth(): number
    getStartDay(): number
    getStartHour(): number
    isForward(): boolean
    getLunar(): Lunar
    getStartSolar(): Solar
    getDaYun(n?: number): DaYun[]
  }

  export interface DaYun {
    getStartYear(): number
    getEndYear(): number
    getStartAge(): number
    getEndAge(): number
    getIndex(): number
    getLunar(): Lunar
    getGanZhi(): string
    getXun(): string
    getXunKong(): string
    getLiuNian(n?: number): LiuNian[]
  }

  export interface LiuNian {
    getYear(): number
    getAge(): number
    getIndex(): number
    getLunar(): Lunar
    getGanZhi(): string
    getXun(): string
    getXunKong(): string
    getLiuYue(): LiuYue[]
  }

  export interface LiuYue {
    getGanZhi(): string
    getMonthInChinese(): string
    getIndex(): number
    getXun(): string
    getXunKong(): string
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): Solar
    fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Solar
    fromDate(date: Date): Solar
  }

  export const Lunar: {
    fromYmd(year: number, month: number, day: number): Lunar
    fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Lunar
    fromDate(date: Date): Lunar
  }

  export interface LunarYear {
    getLeapMonth(): number
  }

  export const LunarYear: {
    fromYear(year: number): LunarYear
  }

  export const EightChar: {
    fromLunar(lunar: Lunar): EightChar
  }
}
