import { calculateBazi, serializeBaziJson } from './baziCalculator'

const result = calculateBazi(
  '陈纪东', '男',
  1974, 8, 19, 13, 30,
  '吉林省 吉林市 昌邑区', 126.55
)
const json = serializeBaziJson(result)
console.log(json)
