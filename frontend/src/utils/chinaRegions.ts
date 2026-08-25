// 中国省市区级联数据
export interface DistrictData {
  name: string
  districts: string[]
}

export interface CityData {
  name: string
  districts: DistrictData[]
}

export interface ProvinceData {
  name: string
  cities: CityData[]
}

const chinaRegions: ProvinceData[] = [
  {
    name: '北京市',
    cities: [
      { name: '北京市', districts: [
        { name: '东城区', districts: [] },
        { name: '西城区', districts: [] },
        { name: '朝阳区', districts: [] },
        { name: '丰台区', districts: [] },
        { name: '石景山区', districts: [] },
        { name: '海淀区', districts: [] },
        { name: '门头沟区', districts: [] },
        { name: '房山区', districts: [] },
        { name: '通州区', districts: [] },
        { name: '顺义区', districts: [] },
        { name: '昌平区', districts: [] },
        { name: '大兴区', districts: [] },
        { name: '怀柔区', districts: [] },
        { name: '平谷区', districts: [] },
        { name: '密云区', districts: [] },
        { name: '延庆区', districts: [] },
      ]},
    ],
  },
  {
    name: '天津市',
    cities: [
      { name: '天津市', districts: [
        { name: '和平区', districts: [] },
        { name: '河东区', districts: [] },
        { name: '河西区', districts: [] },
        { name: '南开区', districts: [] },
        { name: '河北区', districts: [] },
        { name: '红桥区', districts: [] },
        { name: '东丽区', districts: [] },
        { name: '西青区', districts: [] },
        { name: '津南区', districts: [] },
        { name: '北辰区', districts: [] },
        { name: '武清区', districts: [] },
        { name: '宝坻区', districts: [] },
        { name: '滨海新区', districts: [] },
        { name: '宁河区', districts: [] },
        { name: '静海区', districts: [] },
        { name: '蓟州区', districts: [] },
      ]},
    ],
  },
  {
    name: '上海市',
    cities: [
      { name: '上海市', districts: [
        { name: '黄浦区', districts: [] },
        { name: '徐汇区', districts: [] },
        { name: '长宁区', districts: [] },
        { name: '静安区', districts: [] },
        { name: '普陀区', districts: [] },
        { name: '虹口区', districts: [] },
        { name: '杨浦区', districts: [] },
        { name: '闵行区', districts: [] },
        { name: '宝山区', districts: [] },
        { name: '嘉定区', districts: [] },
        { name: '浦东新区', districts: [] },
        { name: '金山区', districts: [] },
        { name: '松江区', districts: [] },
        { name: '青浦区', districts: [] },
        { name: '奉贤区', districts: [] },
        { name: '崇明区', districts: [] },
      ]},
    ],
  },
  {
    name: '重庆市',
    cities: [
      { name: '重庆市', districts: [
        { name: '渝中区', districts: [] },
        { name: '大渡口区', districts: [] },
        { name: '江北区', districts: [] },
        { name: '沙坪坝区', districts: [] },
        { name: '九龙坡区', districts: [] },
        { name: '南岸区', districts: [] },
        { name: '北碚区', districts: [] },
        { name: '渝北区', districts: [] },
        { name: '巴南区', districts: [] },
        { name: '涪陵区', districts: [] },
        { name: '长寿区', districts: [] },
        { name: '江津区', districts: [] },
        { name: '合川区', districts: [] },
        { name: '永川区', districts: [] },
        { name: '南川区', districts: [] },
        { name: '綦江区', districts: [] },
        { name: '大足区', districts: [] },
        { name: '璧山区', districts: [] },
        { name: '铜梁区', districts: [] },
        { name: '潼南区', districts: [] },
        { name: '荣昌区', districts: [] },
        { name: '开州区', districts: [] },
        { name: '梁平区', districts: [] },
        { name: '武隆区', districts: [] },
      ]},
    ],
  },
  {
    name: '河北省',
    cities: [
      { name: '石家庄市', districts: [{ name: '长安区', districts: [] }, { name: '桥西区', districts: [] }, { name: '新华区', districts: [] }, { name: '裕华区', districts: [] }, { name: '藁城区', districts: [] }, { name: '鹿泉区', districts: [] }, { name: '栾城区', districts: [] }] },
      { name: '唐山市', districts: [{ name: '路北区', districts: [] }, { name: '路南区', districts: [] }, { name: '古冶区', districts: [] }, { name: '开平区', districts: [] }, { name: '丰南区', districts: [] }, { name: '丰润区', districts: [] }, { name: '曹妃甸区', districts: [] }] },
      { name: '秦皇岛市', districts: [{ name: '海港区', districts: [] }, { name: '山海关区', districts: [] }, { name: '北戴河区', districts: [] }] },
      { name: '邯郸市', districts: [{ name: '邯山区', districts: [] }, { name: '丛台区', districts: [] }, { name: '复兴区', districts: [] }, { name: '峰峰矿区', districts: [] }] },
      { name: '保定市', districts: [{ name: '竞秀区', districts: [] }, { name: '莲池区', districts: [] }, { name: '满城区', districts: [] }, { name: '清苑区', districts: [] }, { name: '徐水区', districts: [] }] },
      { name: '张家口市', districts: [{ name: '桥东区', districts: [] }, { name: '桥西区', districts: [] }, { name: '宣化区', districts: [] }, { name: '下花园区', districts: [] }] },
      { name: '承德市', districts: [{ name: '双桥区', districts: [] }, { name: '双滦区', districts: [] }] },
      { name: '廊坊市', districts: [{ name: '安次区', districts: [] }, { name: '广阳区', districts: [] }] },
      { name: '沧州市', districts: [{ name: '运河区', districts: [] }, { name: '新华区', districts: [] }] },
      { name: '衡水市', districts: [{ name: '桃城区', districts: [] }] },
      { name: '邢台市', districts: [{ name: '襄都区', districts: [] }, { name: '信都区', districts: [] }] },
    ],
  },
  {
    name: '山西省',
    cities: [
      { name: '太原市', districts: [{ name: '小店区', districts: [] }, { name: '迎泽区', districts: [] }, { name: '杏花岭区', districts: [] }, { name: '尖草坪区', districts: [] }, { name: '万柏林区', districts: [] }, { name: '晋源区', districts: [] }] },
      { name: '大同市', districts: [{ name: '平城区', districts: [] }, { name: '云冈区', districts: [] }, { name: '新荣区', districts: [] }, { name: '云州区', districts: [] }] },
      { name: '阳泉市', districts: [{ name: '城区', districts: [] }, { name: '矿区', districts: [] }, { name: '郊区', districts: [] }] },
      { name: '长治市', districts: [{ name: '潞州区', districts: [] }, { name: '上党区', districts: [] }, { name: '屯留区', districts: [] }, { name: '潞城区', districts: [] }] },
      { name: '晋城市', districts: [{ name: '城区', districts: [] }] },
      { name: '临汾市', districts: [{ name: '尧都区', districts: [] }] },
      { name: '运城市', districts: [{ name: '盐湖区', districts: [] }] },
    ],
  },
  {
    name: '内蒙古自治区',
    cities: [
      { name: '呼和浩特市', districts: [{ name: '新城区', districts: [] }, { name: '回民区', districts: [] }, { name: '玉泉区', districts: [] }, { name: '赛罕区', districts: [] }] },
      { name: '包头市', districts: [{ name: '昆都仑区', districts: [] }, { name: '东河区', districts: [] }, { name: '青山区', districts: [] }, { name: '九原区', districts: [] }] },
      { name: '鄂尔多斯市', districts: [{ name: '东胜区', districts: [] }, { name: '康巴什区', districts: [] }] },
      { name: '赤峰市', districts: [{ name: '红山区', districts: [] }, { name: '松山区', districts: [] }] },
      { name: '呼伦贝尔市', districts: [{ name: '海拉尔区', districts: [] }] },
    ],
  },
  {
    name: '辽宁省',
    cities: [
      { name: '沈阳市', districts: [{ name: '和平区', districts: [] }, { name: '沈河区', districts: [] }, { name: '大东区', districts: [] }, { name: '皇姑区', districts: [] }, { name: '铁西区', districts: [] }, { name: '苏家屯区', districts: [] }, { name: '浑南区', districts: [] }, { name: '沈北新区', districts: [] }, { name: '于洪区', districts: [] }, { name: '辽中区', districts: [] }] },
      { name: '大连市', districts: [{ name: '中山区', districts: [] }, { name: '西岗区', districts: [] }, { name: '沙河口区', districts: [] }, { name: '甘井子区', districts: [] }, { name: '旅顺口区', districts: [] }, { name: '金州区', districts: [] }] },
      { name: '鞍山市', districts: [{ name: '铁东区', districts: [] }, { name: '铁西区', districts: [] }, { name: '立山区', districts: [] }, { name: '千山区', districts: [] }] },
      { name: '抚顺市', districts: [{ name: '新抚区', districts: [] }, { name: '东洲区', districts: [] }, { name: '望花区', districts: [] }, { name: '顺城区', districts: [] }] },
      { name: '锦州市', districts: [{ name: '古塔区', districts: [] }, { name: '凌河区', districts: [] }, { name: '太和区', districts: [] }] },
      { name: '营口市', districts: [{ name: '站前区', districts: [] }, { name: '西市区', districts: [] }, { name: '鲅鱼圈区', districts: [] }] },
    ],
  },
  {
    name: '吉林省',
    cities: [
      { name: '长春市', districts: [{ name: '南关区', districts: [] }, { name: '宽城区', districts: [] }, { name: '朝阳区', districts: [] }, { name: '二道区', districts: [] }, { name: '绿园区', districts: [] }, { name: '双阳区', districts: [] }, { name: '九台区', districts: [] }] },
      { name: '吉林市', districts: [{ name: '昌邑区', districts: [] }, { name: '龙潭区', districts: [] }, { name: '船营区', districts: [] }, { name: '丰满区', districts: [] }] },
      { name: '延边朝鲜族自治州', districts: [{ name: '延吉市', districts: [] }] },
    ],
  },
  {
    name: '黑龙江省',
    cities: [
      { name: '哈尔滨市', districts: [{ name: '道里区', districts: [] }, { name: '南岗区', districts: [] }, { name: '道外区', districts: [] }, { name: '平房区', districts: [] }, { name: '松北区', districts: [] }, { name: '香坊区', districts: [] }, { name: '呼兰区', districts: [] }, { name: '阿城区', districts: [] }, { name: '双城区', districts: [] }] },
      { name: '齐齐哈尔市', districts: [{ name: '龙沙区', districts: [] }, { name: '建华区', districts: [] }, { name: '铁锋区', districts: [] }] },
      { name: '大庆市', districts: [{ name: '萨尔图区', districts: [] }, { name: '龙凤区', districts: [] }, { name: '让胡路区', districts: [] }] },
      { name: '牡丹江市', districts: [{ name: '东安区', districts: [] }, { name: '阳明区', districts: [] }, { name: '爱民区', districts: [] }, { name: '西安区', districts: [] }] },
    ],
  },
  {
    name: '江苏省',
    cities: [
      { name: '南京市', districts: [{ name: '玄武区', districts: [] }, { name: '秦淮区', districts: [] }, { name: '建邺区', districts: [] }, { name: '鼓楼区', districts: [] }, { name: '浦口区', districts: [] }, { name: '栖霞区', districts: [] }, { name: '雨花台区', districts: [] }, { name: '江宁区', districts: [] }, { name: '六合区', districts: [] }, { name: '溧水区', districts: [] }, { name: '高淳区', districts: [] }] },
      { name: '无锡市', districts: [{ name: '梁溪区', districts: [] }, { name: '锡山区', districts: [] }, { name: '惠山区', districts: [] }, { name: '滨湖区', districts: [] }, { name: '新吴区', districts: [] }] },
      { name: '徐州市', districts: [{ name: '鼓楼区', districts: [] }, { name: '云龙区', districts: [] }, { name: '贾汪区', districts: [] }, { name: '泉山区', districts: [] }, { name: '铜山区', districts: [] }] },
      { name: '常州市', districts: [{ name: '天宁区', districts: [] }, { name: '钟楼区', districts: [] }, { name: '新北区', districts: [] }, { name: '武进区', districts: [] }, { name: '金坛区', districts: [] }] },
      { name: '苏州市', districts: [{ name: '姑苏区', districts: [] }, { name: '虎丘区', districts: [] }, { name: '吴中区', districts: [] }, { name: '相城区', districts: [] }, { name: '吴江区', districts: [] }] },
      { name: '南通市', districts: [{ name: '崇川区', districts: [] }, { name: '通州区', districts: [] }, { name: '海门区', districts: [] }] },
      { name: '连云港市', districts: [{ name: '连云区', districts: [] }, { name: '海州区', districts: [] }, { name: '赣榆区', districts: [] }] },
      { name: '淮安市', districts: [{ name: '清江浦区', districts: [] }, { name: '淮安区', districts: [] }, { name: '淮阴区', districts: [] }] },
      { name: '盐城市', districts: [{ name: '亭湖区', districts: [] }, { name: '盐都区', districts: [] }, { name: '大丰区', districts: [] }] },
      { name: '扬州市', districts: [{ name: '广陵区', districts: [] }, { name: '邗江区', districts: [] }, { name: '江都区', districts: [] }] },
      { name: '镇江市', districts: [{ name: '京口区', districts: [] }, { name: '润州区', districts: [] }, { name: '丹徒区', districts: [] }] },
      { name: '泰州市', districts: [{ name: '海陵区', districts: [] }, { name: '高港区', districts: [] }, { name: '姜堰区', districts: [] }] },
      { name: '宿迁市', districts: [{ name: '宿城区', districts: [] }, { name: '宿豫区', districts: [] }] },
    ],
  },
  {
    name: '浙江省',
    cities: [
      { name: '杭州市', districts: [{ name: '上城区', districts: [] }, { name: '拱墅区', districts: [] }, { name: '西湖区', districts: [] }, { name: '滨江区', districts: [] }, { name: '萧山区', districts: [] }, { name: '余杭区', districts: [] }, { name: '富阳区', districts: [] }, { name: '临安区', districts: [] }, { name: '临平区', districts: [] }, { name: '钱塘区', districts: [] }] },
      { name: '宁波市', districts: [{ name: '海曙区', districts: [] }, { name: '江北区', districts: [] }, { name: '北仑区', districts: [] }, { name: '镇海区', districts: [] }, { name: '鄞州区', districts: [] }, { name: '奉化区', districts: [] }] },
      { name: '温州市', districts: [{ name: '鹿城区', districts: [] }, { name: '龙湾区', districts: [] }, { name: '瓯海区', districts: [] }, { name: '洞头区', districts: [] }] },
      { name: '嘉兴市', districts: [{ name: '南湖区', districts: [] }, { name: '秀洲区', districts: [] }] },
      { name: '湖州市', districts: [{ name: '吴兴区', districts: [] }, { name: '南浔区', districts: [] }] },
      { name: '绍兴市', districts: [{ name: '越城区', districts: [] }, { name: '柯桥区', districts: [] }, { name: '上虞区', districts: [] }] },
      { name: '金华市', districts: [{ name: '婺城区', districts: [] }, { name: '金东区', districts: [] }] },
      { name: '台州市', districts: [{ name: '椒江区', districts: [] }, { name: '黄岩区', districts: [] }, { name: '路桥区', districts: [] }] },
    ],
  },
  {
    name: '安徽省',
    cities: [
      { name: '合肥市', districts: [{ name: '瑶海区', districts: [] }, { name: '庐阳区', districts: [] }, { name: '蜀山区', districts: [] }, { name: '包河区', districts: [] }] },
      { name: '芜湖市', districts: [{ name: '镜湖区', districts: [] }, { name: '弋江区', districts: [] }, { name: '鸠江区', districts: [] }] },
      { name: '蚌埠市', districts: [{ name: '龙子湖区', districts: [] }, { name: '蚌山区', districts: [] }, { name: '禹会区', districts: [] }, { name: '淮上区', districts: [] }] },
      { name: '马鞍山市', districts: [{ name: '花山区', districts: [] }, { name: '雨山区', districts: [] }] },
      { name: '安庆市', districts: [{ name: '迎江区', districts: [] }, { name: '大观区', districts: [] }, { name: '宜秀区', districts: [] }] },
    ],
  },
  {
    name: '福建省',
    cities: [
      { name: '福州市', districts: [{ name: '鼓楼区', districts: [] }, { name: '台江区', districts: [] }, { name: '仓山区', districts: [] }, { name: '马尾区', districts: [] }, { name: '晋安区', districts: [] }, { name: '长乐区', districts: [] }] },
      { name: '厦门市', districts: [{ name: '思明区', districts: [] }, { name: '湖里区', districts: [] }, { name: '集美区', districts: [] }, { name: '海沧区', districts: [] }, { name: '同安区', districts: [] }, { name: '翔安区', districts: [] }] },
      { name: '泉州市', districts: [{ name: '鲤城区', districts: [] }, { name: '丰泽区', districts: [] }, { name: '洛江区', districts: [] }, { name: '泉港区', districts: [] }] },
      { name: '莆田市', districts: [{ name: '城厢区', districts: [] }, { name: '涵江区', districts: [] }, { name: '荔城区', districts: [] }, { name: '秀屿区', districts: [] }] },
      { name: '漳州市', districts: [{ name: '芗城区', districts: [] }, { name: '龙文区', districts: [] }] },
    ],
  },
  {
    name: '江西省',
    cities: [
      { name: '南昌市', districts: [{ name: '东湖区', districts: [] }, { name: '西湖区', districts: [] }, { name: '青云谱区', districts: [] }, { name: '青山湖区', districts: [] }, { name: '新建区', districts: [] }] },
      { name: '九江市', districts: [{ name: '濂溪区', districts: [] }, { name: '浔阳区', districts: [] }, { name: '柴桑区', districts: [] }] },
      { name: '赣州市', districts: [{ name: '章贡区', districts: [] }, { name: '南康区', districts: [] }, { name: '赣县区', districts: [] }] },
    ],
  },
  {
    name: '山东省',
    cities: [
      { name: '济南市', districts: [{ name: '历下区', districts: [] }, { name: '市中区', districts: [] }, { name: '槐荫区', districts: [] }, { name: '天桥区', districts: [] }, { name: '历城区', districts: [] }, { name: '长清区', districts: [] }, { name: '章丘区', districts: [] }, { name: '济阳区', districts: [] }, { name: '莱芜区', districts: [] }, { name: '钢城区', districts: [] }] },
      { name: '青岛市', districts: [{ name: '市南区', districts: [] }, { name: '市北区', districts: [] }, { name: '黄岛区', districts: [] }, { name: '崂山区', districts: [] }, { name: '李沧区', districts: [] }, { name: '城阳区', districts: [] }, { name: '即墨区', districts: [] }] },
      { name: '淄博市', districts: [{ name: '淄川区', districts: [] }, { name: '张店区', districts: [] }, { name: '博山区', districts: [] }, { name: '临淄区', districts: [] }, { name: '周村区', districts: [] }] },
      { name: '烟台市', districts: [{ name: '芝罘区', districts: [] }, { name: '福山区', districts: [] }, { name: '牟平区', districts: [] }, { name: '莱山区', districts: [] }, { name: '蓬莱区', districts: [] }] },
      { name: '潍坊市', districts: [{ name: '潍城区', districts: [] }, { name: '寒亭区', districts: [] }, { name: '坊子区', districts: [] }, { name: '奎文区', districts: [] }] },
      { name: '济宁市', districts: [{ name: '任城区', districts: [] }, { name: '兖州区', districts: [] }] },
      { name: '泰安市', districts: [{ name: '泰山区', districts: [] }, { name: '岱岳区', districts: [] }] },
      { name: '威海市', districts: [{ name: '环翠区', districts: [] }, { name: '文登区', districts: [] }] },
      { name: '临沂市', districts: [{ name: '兰山区', districts: [] }, { name: '罗庄区', districts: [] }, { name: '河东区', districts: [] }] },
    ],
  },
  {
    name: '河南省',
    cities: [
      { name: '郑州市', districts: [{ name: '中原区', districts: [] }, { name: '二七区', districts: [] }, { name: '管城回族区', districts: [] }, { name: '金水区', districts: [] }, { name: '上街区', districts: [] }, { name: '惠济区', districts: [] }] },
      { name: '开封市', districts: [{ name: '龙亭区', districts: [] }, { name: '顺河回族区', districts: [] }, { name: '鼓楼区', districts: [] }, { name: '禹王台区', districts: [] }] },
      { name: '洛阳市', districts: [{ name: '老城区', districts: [] }, { name: '西工区', districts: [] }, { name: '瀍河区', districts: [] }, { name: '涧西区', districts: [] }, { name: '洛龙区', districts: [] }] },
      { name: '新乡市', districts: [{ name: '红旗区', districts: [] }, { name: '卫滨区', districts: [] }, { name: '凤泉区', districts: [] }, { name: '牧野区', districts: [] }] },
      { name: '南阳市', districts: [{ name: '宛城区', districts: [] }, { name: '卧龙区', districts: [] }] },
    ],
  },
  {
    name: '湖北省',
    cities: [
      { name: '武汉市', districts: [{ name: '江岸区', districts: [] }, { name: '江汉区', districts: [] }, { name: '硚口区', districts: [] }, { name: '汉阳区', districts: [] }, { name: '武昌区', districts: [] }, { name: '青山区', districts: [] }, { name: '洪山区', districts: [] }, { name: '东西湖区', districts: [] }, { name: '汉南区', districts: [] }, { name: '蔡甸区', districts: [] }, { name: '江夏区', districts: [] }, { name: '黄陂区', districts: [] }, { name: '新洲区', districts: [] }] },
      { name: '宜昌市', districts: [{ name: '西陵区', districts: [] }, { name: '伍家岗区', districts: [] }, { name: '点军区', districts: [] }, { name: '猇亭区', districts: [] }, { name: '夷陵区', districts: [] }] },
      { name: '襄阳市', districts: [{ name: '襄城区', districts: [] }, { name: '樊城区', districts: [] }, { name: '襄州区', districts: [] }] },
      { name: '荆州市', districts: [{ name: '沙市区', districts: [] }, { name: '荆州区', districts: [] }] },
    ],
  },
  {
    name: '湖南省',
    cities: [
      { name: '长沙市', districts: [{ name: '芙蓉区', districts: [] }, { name: '天心区', districts: [] }, { name: '岳麓区', districts: [] }, { name: '开福区', districts: [] }, { name: '雨花区', districts: [] }, { name: '望城区', districts: [] }] },
      { name: '株洲市', districts: [{ name: '天元区', districts: [] }, { name: '荷塘区', districts: [] }, { name: '芦淞区', districts: [] }, { name: '石峰区', districts: [] }] },
      { name: '湘潭市', districts: [{ name: '雨湖区', districts: [] }, { name: '岳塘区', districts: [] }] },
      { name: '衡阳市', districts: [{ name: '珠晖区', districts: [] }, { name: '雁峰区', districts: [] }, { name: '石鼓区', districts: [] }, { name: '蒸湘区', districts: [] }] },
      { name: '岳阳市', districts: [{ name: '岳阳楼区', districts: [] }, { name: '云溪区', districts: [] }, { name: '君山区', districts: [] }] },
    ],
  },
  {
    name: '广东省',
    cities: [
      { name: '广州市', districts: [{ name: '越秀区', districts: [] }, { name: '海珠区', districts: [] }, { name: '荔湾区', districts: [] }, { name: '天河区', districts: [] }, { name: '白云区', districts: [] }, { name: '黄埔区', districts: [] }, { name: '番禺区', districts: [] }, { name: '花都区', districts: [] }, { name: '南沙区', districts: [] }, { name: '从化区', districts: [] }, { name: '增城区', districts: [] }] },
      { name: '深圳市', districts: [{ name: '福田区', districts: [] }, { name: '罗湖区', districts: [] }, { name: '南山区', districts: [] }, { name: '盐田区', districts: [] }, { name: '宝安区', districts: [] }, { name: '龙岗区', districts: [] }, { name: '龙华区', districts: [] }, { name: '坪山区', districts: [] }, { name: '光明区', districts: [] }] },
      { name: '珠海市', districts: [{ name: '香洲区', districts: [] }, { name: '斗门区', districts: [] }, { name: '金湾区', districts: [] }] },
      { name: '汕头市', districts: [{ name: '金平区', districts: [] }, { name: '龙湖区', districts: [] }, { name: '濠江区', districts: [] }, { name: '潮阳区', districts: [] }, { name: '潮南区', districts: [] }, { name: '澄海区', districts: [] }] },
      { name: '佛山市', districts: [{ name: '禅城区', districts: [] }, { name: '南海区', districts: [] }, { name: '顺德区', districts: [] }, { name: '三水区', districts: [] }, { name: '高明区', districts: [] }] },
      { name: '东莞市', districts: [{ name: '东莞市', districts: [] }] },
      { name: '中山市', districts: [{ name: '中山市', districts: [] }] },
      { name: '惠州市', districts: [{ name: '惠城区', districts: [] }, { name: '惠阳区', districts: [] }] },
      { name: '江门市', districts: [{ name: '蓬江区', districts: [] }, { name: '江海区', districts: [] }, { name: '新会区', districts: [] }] },
      { name: '湛江市', districts: [{ name: '赤坎区', districts: [] }, { name: '霞山区', districts: [] }, { name: '坡头区', districts: [] }, { name: '麻章区', districts: [] }] },
    ],
  },
  {
    name: '广西壮族自治区',
    cities: [
      { name: '南宁市', districts: [{ name: '青秀区', districts: [] }, { name: '兴宁区', districts: [] }, { name: '江南区', districts: [] }, { name: '西乡塘区', districts: [] }, { name: '良庆区', districts: [] }, { name: '邕宁区', districts: [] }, { name: '武鸣区', districts: [] }] },
      { name: '柳州市', districts: [{ name: '城中区', districts: [] }, { name: '鱼峰区', districts: [] }, { name: '柳南区', districts: [] }, { name: '柳北区', districts: [] }] },
      { name: '桂林市', districts: [{ name: '秀峰区', districts: [] }, { name: '叠彩区', districts: [] }, { name: '象山区', districts: [] }, { name: '七星区', districts: [] }, { name: '雁山区', districts: [] }, { name: '临桂区', districts: [] }] },
      { name: '北海市', districts: [{ name: '海城区', districts: [] }, { name: '银海区', districts: [] }, { name: '铁山港区', districts: [] }] },
    ],
  },
  {
    name: '海南省',
    cities: [
      { name: '海口市', districts: [{ name: '秀英区', districts: [] }, { name: '龙华区', districts: [] }, { name: '琼山区', districts: [] }, { name: '美兰区', districts: [] }] },
      { name: '三亚市', districts: [{ name: '海棠区', districts: [] }, { name: '吉阳区', districts: [] }, { name: '天涯区', districts: [] }, { name: '崖州区', districts: [] }] },
    ],
  },
  {
    name: '四川省',
    cities: [
      { name: '成都市', districts: [{ name: '锦江区', districts: [] }, { name: '青羊区', districts: [] }, { name: '金牛区', districts: [] }, { name: '武侯区', districts: [] }, { name: '成华区', districts: [] }, { name: '龙泉驿区', districts: [] }, { name: '青白江区', districts: [] }, { name: '新都区', districts: [] }, { name: '温江区', districts: [] }, { name: '双流区', districts: [] }, { name: '郫都区', districts: [] }, { name: '新津区', districts: [] }] },
      { name: '绵阳市', districts: [{ name: '涪城区', districts: [] }, { name: '游仙区', districts: [] }, { name: '安州区', districts: [] }] },
      { name: '德阳市', districts: [{ name: '旌阳区', districts: [] }] },
      { name: '宜宾市', districts: [{ name: '翠屏区', districts: [] }, { name: '南溪区', districts: [] }, { name: '叙州区', districts: [] }] },
      { name: '泸州市', districts: [{ name: '江阳区', districts: [] }, { name: '纳溪区', districts: [] }, { name: '龙马潭区', districts: [] }] },
      { name: '乐山市', districts: [{ name: '市中区', districts: [] }, { name: '沙湾区', districts: [] }, { name: '五通桥区', districts: [] }, { name: '金口河区', districts: [] }] },
    ],
  },
  {
    name: '贵州省',
    cities: [
      { name: '贵阳市', districts: [{ name: '南明区', districts: [] }, { name: '云岩区', districts: [] }, { name: '花溪区', districts: [] }, { name: '乌当区', districts: [] }, { name: '白云区', districts: [] }, { name: '观山湖区', districts: [] }] },
      { name: '遵义市', districts: [{ name: '红花岗区', districts: [] }, { name: '汇川区', districts: [] }, { name: '播州区', districts: [] }] },
    ],
  },
  {
    name: '云南省',
    cities: [
      { name: '昆明市', districts: [{ name: '五华区', districts: [] }, { name: '盘龙区', districts: [] }, { name: '官渡区', districts: [] }, { name: '西山区', districts: [] }, { name: '东川区', districts: [] }, { name: '呈贡区', districts: [] }, { name: '晋宁区', districts: [] }] },
      { name: '大理白族自治州', districts: [{ name: '大理市', districts: [] }] },
      { name: '丽江市', districts: [{ name: '古城区', districts: [] }] },
    ],
  },
  {
    name: '西藏自治区',
    cities: [
      { name: '拉萨市', districts: [{ name: '城关区', districts: [] }, { name: '堆龙德庆区', districts: [] }] },
    ],
  },
  {
    name: '陕西省',
    cities: [
      { name: '西安市', districts: [{ name: '新城区', districts: [] }, { name: '碑林区', districts: [] }, { name: '莲湖区', districts: [] }, { name: '灞桥区', districts: [] }, { name: '未央区', districts: [] }, { name: '雁塔区', districts: [] }, { name: '阎良区', districts: [] }, { name: '临潼区', districts: [] }, { name: '长安区', districts: [] }, { name: '高陵区', districts: [] }, { name: '鄠邑区', districts: [] }] },
      { name: '咸阳市', districts: [{ name: '秦都区', districts: [] }, { name: '杨陵区', districts: [] }, { name: '渭城区', districts: [] }] },
      { name: '宝鸡市', districts: [{ name: '渭滨区', districts: [] }, { name: '金台区', districts: [] }, { name: '陈仓区', districts: [] }] },
    ],
  },
  {
    name: '甘肃省',
    cities: [
      { name: '兰州市', districts: [{ name: '城关区', districts: [] }, { name: '七里河区', districts: [] }, { name: '西固区', districts: [] }, { name: '安宁区', districts: [] }, { name: '红古区', districts: [] }] },
      { name: '天水市', districts: [{ name: '秦州区', districts: [] }, { name: '麦积区', districts: [] }] },
    ],
  },
  {
    name: '青海省',
    cities: [
      { name: '西宁市', districts: [{ name: '城东区', districts: [] }, { name: '城中区', districts: [] }, { name: '城西区', districts: [] }, { name: '城北区', districts: [] }] },
    ],
  },
  {
    name: '宁夏回族自治区',
    cities: [
      { name: '银川市', districts: [{ name: '兴庆区', districts: [] }, { name: '西夏区', districts: [] }, { name: '金凤区', districts: [] }] },
    ],
  },
  {
    name: '新疆维吾尔自治区',
    cities: [
      { name: '乌鲁木齐市', districts: [{ name: '天山区', districts: [] }, { name: '沙依巴克区', districts: [] }, { name: '新市区', districts: [] }, { name: '水磨沟区', districts: [] }, { name: '头屯河区', districts: [] }, { name: '达坂城区', districts: [] }, { name: '米东区', districts: [] }] },
    ],
  },
  {
    name: '香港特别行政区',
    cities: [
      { name: '香港', districts: [{ name: '中西区', districts: [] }, { name: '湾仔区', districts: [] }, { name: '东区', districts: [] }, { name: '南区', districts: [] }, { name: '油尖旺区', districts: [] }, { name: '深水埗区', districts: [] }, { name: '九龙城区', districts: [] }, { name: '黄大仙区', districts: [] }, { name: '观塘区', districts: [] }, { name: '荃湾区', districts: [] }, { name: '屯门区', districts: [] }, { name: '元朗区', districts: [] }, { name: '北区', districts: [] }, { name: '大埔区', districts: [] }, { name: '沙田区', districts: [] }, { name: '西贡区', districts: [] }, { name: '离岛区', districts: [] }] },
    ],
  },
  {
    name: '澳门特别行政区',
    cities: [
      { name: '澳门', districts: [{ name: '花地玛堂区', districts: [] }, { name: '圣安多尼堂区', districts: [] }, { name: '望德堂区', districts: [] }, { name: '大堂区', districts: [] }, { name: '风顺堂区', districts: [] }, { name: '嘉模堂区', districts: [] }, { name: '圣方济各堂区', districts: [] }] },
    ],
  },
  {
    name: '台湾省',
    cities: [
      { name: '台北市', districts: [{ name: '中正区', districts: [] }, { name: '大同区', districts: [] }, { name: '中山区', districts: [] }, { name: '松山区', districts: [] }, { name: '大安区', districts: [] }, { name: '信义区', districts: [] }, { name: '内湖区', districts: [] }, { name: '南港区', districts: [] }, { name: '士林区', districts: [] }, { name: '北投区', districts: [] }, { name: '文山区', districts: [] }] },
      { name: '高雄市', districts: [{ name: '盐埕区', districts: [] }, { name: '鼓山区', districts: [] }, { name: '左营区', districts: [] }, { name: '楠梓区', districts: [] }, { name: '三民区', districts: [] }, { name: '新兴区', districts: [] }, { name: '前金区', districts: [] }, { name: '苓雅区', districts: [] }, { name: '前镇区', districts: [] }, { name: '旗津区', districts: [] }, { name: '小港区', districts: [] }] },
      { name: '台中市', districts: [{ name: '中区', districts: [] }, { name: '东区', districts: [] }, { name: '南区', districts: [] }, { name: '西区', districts: [] }, { name: '北区', districts: [] }, { name: '西屯区', districts: [] }, { name: '南屯区', districts: [] }, { name: '北屯区', districts: [] }] },
      { name: '台南市', districts: [{ name: '中西区', districts: [] }, { name: '东区', districts: [] }, { name: '南区', districts: [] }, { name: '北区', districts: [] }, { name: '安平区', districts: [] }, { name: '安南区', districts: [] }] },
    ],
  },
]

export default chinaRegions