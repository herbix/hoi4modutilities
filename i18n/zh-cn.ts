import { __table } from './en';
/*eslint sort-keys: "warn"*/
const zhTable: Partial<typeof __table> = {
    "combobox.all": "（全部）",
    "combobox.multiple": "{0}（+{1}）",
    "combobox.noselection": "（无选择）",
    "days": "天",
    "error": "错误",
    "eventtree.delay": "延迟：",
    "eventtree.eventid": "事件编号：",
    "eventtree.fireonlyonce": "单次",
    "eventtree.hidden": "隐藏",
    "eventtree.istriggeredonly": "仅能触发",
    "eventtree.major": "主要",
    "eventtree.mtthbase": "平均发生时间（基础值）：",
    "eventtree.scope": "目标：",
    "eventtree.title": "标题：",
    "filenotondisk": "文件不在硬盘上：{0}。",
    "focustree.allowbranch": "允许分支：",
    "focustree.conditions": "条件：",
    "focustree.nofocustree": "没有国策树。",
    "focustree.search": "搜索：",
    "focustree.warnings": "开启/合并警告列表",
    "focustree.warnings.focusidconflict": "在这个文件中有多个国策的id字段为{0}：{1}。",
    "focustree.warnings.focusidconflict2": "在这些文件中有多个国策的id字段为{0}：{1}，{2}。",
    "focustree.warnings.focusnoid": "在这个文件中有国策没有id字段：{0}。",
    "focustree.warnings.relativepositioncircularref": "这些国策的relative position id字段有循环引用：{0}。",
    "focustree.warnings.relativepositionidnotexist": "国策{0}的relative position id字段指向的国策不存在于文件中：{1}。",
    "gfx.filter": "筛选器：",
    "gfx.imagenotfound": "没有找到图像",
    "hours": "小时",
    "infile": "在文件 {0} 中：\n",
    "loading": "加载中……",
    "modfile.clicktoselect": "点击选择模组文件……",
    "modfile.errorreading": "读取文件出错：",
    "modfile.filenotexist": "模组文件不存在：{0}",
    "modfile.globalsetting": "全局设置",
    "modfile.infolder": "{0}目录中",
    "modfile.nomodfile": "（没有模组文件）",
    "modfile.select": "浏览模组文件……",
    "modfile.selectedfilenotondisk": "选择的文件不在硬盘上：{0}。",
    "modfile.selectworkingmod": "选择工作模组",
    "modfile.type": "模组文件",
    "modfile.workspacesetting": "工作区设置",
    "preview.cantfinddoc": "无法找到打开的文档：{0}。",
    "preview.cantpreviewfile": "无法预览此文件。\n可以预览的类型：{0}。",
    "preview.failedtoopen": "无法打开文件 “{0}”：{1}。",
    "preview.mustopenafolder": "要打开文件“{0}”，必须先打开文件夹。",
    "preview.noactivedoc": "没有打开的文档。",
    "preview.selectafolder": "选择复制“{0}”的目标文件夹",
    "preview.selectedfoldernotondisk": "选择的目标文件夹不在硬盘上：\"{0}\"。",
    "preview.viewtitle": "预览：{0}",
    "scanref.done": "扫描引用完毕。",
    "scanref.noeditor": "无打开的编辑器。",
    "scanref.unsupportedtype": "无法扫描此文件的引用。",
    "techtree.cantfindtechfolderin": "在{1}里找不到科技树目录{0}。",
    "techtree.cantfindtechitemin": "在{1}里找不到containerwindowtype \"{0}\"。",
    "techtree.cantfindviewin": "在{1}里找不到控件{0}。",
    "techtree.notechtree": "没有科技树。",
    "techtree.techfolder": "科技树目录：",
    "worldmap.error.fieldnotindefaultmap": "default.map中缺少字段“{0}”。",
    "worldmap.error.provinceidtoolarge": "地块编号过大，最大值：{0}。",
    "worldmap.failedtoload": "载入地图失败：{0}。",
    "worldmap.failedtoopenstate": "打开{0}文件失败：{1}。",
    "worldmap.mustopenafolder": "要打开{0}文件，必须先打开文件夹。",
    "worldmap.openfiletype.state": "省份",
    "worldmap.openfiletype.strategicregion": "战略区域",
    "worldmap.openfiletype.supplyarea": "补给区域",
    "worldmap.preview.title": "预览世界地图",
    "worldmap.progress.applying": "引入更新……",
    "worldmap.progress.calculatingedge": "计算地块边界……",
    "worldmap.progress.calculatingregion": "计算地块区域……",
    "worldmap.progress.comparing": "对比更新……",
    "worldmap.progress.loadingadjacencies": "载入地块邻接表……",
    "worldmap.progress.loadingcontinents": "载入大洲定义……",
    "worldmap.progress.loadingcountries": "载入国家……",
    "worldmap.progress.loadingdefaultmap": "载入default.map……",
    "worldmap.progress.loadingprovincebmp": "载入地块位图……",
    "worldmap.progress.loadingprovincedef": "载入地块定义……",
    "worldmap.progress.loadingstates": "载入省份……",
    "worldmap.progress.loadingstrategicregions": "载入战略区域……",
    "worldmap.progress.loadingsupplyareas": "载入补给区域……",
    "worldmap.progress.loadstatecategories": "载入省份分类……",
    "worldmap.progress.mapprovincestostates": "映射地块到省份……",
    "worldmap.progress.mapprovincestostrategicregions": "映射地块到战略区域……",
    "worldmap.progress.mapstatetosupplyarea": "映射省份到补给区域……",
    "worldmap.progress.mergeandvalidateprovince": "合并和检查地块……",
    "worldmap.progress.visualizing": "显示地图数据：{0}",
    "worldmap.selectafolder": "选择复制{0}的目标文件夹",
    "worldmap.tooltip.adjacencies": "相邻地块",
    "worldmap.tooltip.category": "分类",
    "worldmap.tooltip.coastal": "沿海",
    "worldmap.tooltip.continent": "大洲",
    "worldmap.tooltip.coreof": "拥有核心",
    "worldmap.tooltip.impassable": "不可通行",
    "worldmap.tooltip.manpower": "人力",
    "worldmap.tooltip.navalterrain": "海军地形",
    "worldmap.tooltip.owner": "控制者",
    "worldmap.tooltip.province": "地块",
    "worldmap.tooltip.provinces": "地块",
    "worldmap.tooltip.state": "省份",
    "worldmap.tooltip.states": "省份",
    "worldmap.tooltip.strategicregion": "战略区域",
    "worldmap.tooltip.supplyarea": "补给区域",
    "worldmap.tooltip.supplyvalue": "补给值",
    "worldmap.tooltip.terrain": "地形",
    "worldmap.tooltip.type": "类型",
    "worldmap.tooltip.victorypoint": "胜利点",
    "worldmap.topbar.colorset": "配色：",
    "worldmap.topbar.colorset.continent": "大洲",
    "worldmap.topbar.colorset.country": "国家",
    "worldmap.topbar.colorset.manpower": "人力",
    "worldmap.topbar.colorset.provinceid": "地块",
    "worldmap.topbar.colorset.provincetype": "地块类型",
    "worldmap.topbar.colorset.stateid": "省份",
    "worldmap.topbar.colorset.strategicregionid": "战略区域",
    "worldmap.topbar.colorset.supplyareaid": "补给区域",
    "worldmap.topbar.colorset.supplyvalue": "补给值",
    "worldmap.topbar.colorset.terrain": "地形",
    "worldmap.topbar.colorset.vicotrypoint": "胜利点",
    "worldmap.topbar.colorset.warnings": "警告",
    "worldmap.topbar.open.title": "在工作区内打开",
    "worldmap.topbar.refresh.title": "刷新",
    "worldmap.topbar.search": "搜索：",
    "worldmap.topbar.search.placeholder": "范围：{0}",
    "worldmap.topbar.search.title": "搜索",
    "worldmap.topbar.viewmode": "预览模式：",
    "worldmap.topbar.viewmode.province": "地块",
    "worldmap.topbar.viewmode.state": "省份",
    "worldmap.topbar.viewmode.strategicregion": "战略区域",
    "worldmap.topbar.viewmode.supplyarea": "补给区域",
    "worldmap.topbar.viewmode.warnings": "警告",
    "worldmap.topbar.warningfilter": "过滤警告：",
    "worldmap.topbar.warnings.title": "开启/合并警告列表",
    "worldmap.warnings": "警告：\n\n{0}",
    "worldmap.warnings.adjacencynotexist": "邻接的顶点地块不存在：{0}，{1}",
    "worldmap.warnings.adjacencythroughnotexist": "邻接的经过地块不存在：{0}",
    "worldmap.warnings.continentnotdefined": "编号为{0}的大洲不存在。",
    "worldmap.warnings.navalterrainnotdefined": "海军地形“{0}”不存在。",
    "worldmap.warnings.nowarnings": "无警告。",
    "worldmap.warnings.provincecolorconflict": "地块{0}和地块{1}的颜色冲突。",
    "worldmap.warnings.provinceidconflict": "有多个地块使用编号{0}。设置前者编号为{1}。",
    "worldmap.warnings.provinceinmultiplestrategicregions": "地块{0}存在于多个战略区域中：{1}，{2}。",
    "worldmap.warnings.provinceinmultistates": "地块{0}存在于多个省份中：{1}，{2}。",
    "worldmap.warnings.provinceinstrategicregionnotexist": "战略区域{1}中的地块{0}不存在。",
    "worldmap.warnings.provincenocontinent": "陆地地块{0}应当属于某个大洲。",
    "worldmap.warnings.provincenostrategicregion": "地块{0}不在任何战略区域中。",
    "worldmap.warnings.provincenotexist": "地块{0}不存在。",
    "worldmap.warnings.provincenotexistindef": "颜色为({0}, {1}, {2})，位于位图({3}, {4})的地块在定义里不存在。",
    "worldmap.warnings.provincenotexistonmap": "地块{0}不存在于地图上。",
    "worldmap.warnings.provincenothere": "地块{0}不属于此省份，但胜利点定义在这个省份中。",
    "worldmap.warnings.provincetoolarge": "地块过大：{0}x{1}。",
    "worldmap.warnings.statecategoryconflict": "有多个省份分类使用名称“{0}”。",
    "worldmap.warnings.statecategorynotexist": "省份{0}使用的分类不存在：{1}。",
    "worldmap.warnings.statehassea": "海洋地块{0}不应当属于省份中。",
    "worldmap.warnings.stateidconflict": "有多个省份使用编号{0}。",
    "worldmap.warnings.stateidtoolarge": "省份编号过大，最大值：{0}",
    "worldmap.warnings.stateinmultiplestrategicregions": "省份{0}中的地块{1}和其他地块不在相同战略区域中。",
    "worldmap.warnings.stateinmultiplesupplyareas": "省份{0}在多个补给区域中：{1}，{2}。",
    "worldmap.warnings.stateinsupplyareanotexist": "补给区域{1}中的省份{0}不存在。",
    "worldmap.warnings.statenocategory": "省份没有category字段。",
    "worldmap.warnings.statenoid": "“{0}”里的省份没有id字段。",
    "worldmap.warnings.statenoname": "省份没有name字段。",
    "worldmap.warnings.statenoprovinces": "“{1}”里的省份{0}不包含地块。",
    "worldmap.warnings.statenosupplyarea": "省份{0}不在任何补给区域中。",
    "worldmap.warnings.statenotexist": "省份{0}不存在。",
    "worldmap.warnings.statenovalidprovinces": "省份{0}不包含合法的地块。",
    "worldmap.warnings.stateprovincenotexist": "省份{1}里的地块{0}不存在。",
    "worldmap.warnings.statesnotcontiguous": "补给区域{0}中的省份不连续：{1}，{2}。",
    "worldmap.warnings.statetoolarge": "省份{0}过大：{1}x{2}。",
    "worldmap.warnings.strategicregionidconflict": "有多个战略区域使用编号{0}。",
    "worldmap.warnings.strategicregionidtoolarge": "战略区域编号过大，最大值：{0}。",
    "worldmap.warnings.strategicregionnoid": "“{0}”中的战略区域没有id字段。",
    "worldmap.warnings.strategicregionnoname": "战略区域{0}没有name字段。",
    "worldmap.warnings.strategicregionnoprovinces": "“{1}”中的战略区域{0}不包含地块。",
    "worldmap.warnings.strategicregionnotexist": "战略区域{0}不存在。",
    "worldmap.warnings.strategicregionnovalidprovinces": "战略区域{0}不存在于地图上。",
    "worldmap.warnings.supplyareaidconflict": "有多个补给区域使用编号{0}。",
    "worldmap.warnings.supplyareaidtoolarge": "补给区域编号过大，最大值：{0}。",
    "worldmap.warnings.supplyareanoid": "“{0}”中的补给区域没有id字段。",
    "worldmap.warnings.supplyareanoname": "补给区域{0}没有name字段。",
    "worldmap.warnings.supplyareanostates": "“{1}”中的补给区域{0}不包含省份。",
    "worldmap.warnings.supplyareanotexist": "补给区域{0}不存在。",
    "worldmap.warnings.supplyareanovalidstates": "补给区域{0}不存在于地图上。",
    "worldmap.warnings.terrainnotdefined": "地形\"{0}\"不存在。",
    "worldmap.warnings.xcrossing": "地块有十字交叉边界，位于：({0}，{1})。"
};

export = zhTable;
