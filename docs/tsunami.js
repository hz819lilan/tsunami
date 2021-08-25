let map;
let epicenter_icon;
const GRADE_COLOR = {
  "大津波警報：発表": { color: "#B400FF", width: 11 },
  "大津波警報": { color: "#B400FF", width: 11 },
  "津波警報": { color: "#FF0000", width: 10 },
  "津波注意報": { color: "#FFF000", width: 8 },
  "津波予報（若干の海面変動）": { color: "#00AAFF", width: 7 },
  "警報解除": { color: "#2200B3", width: 7 },
  "津波注意報解除": { color: "#2200B3", width: 7 },
  "津波なし": { color: "#656565", width: 7 },
};

$(window).on("load", function () {
  map = L.map("map", {
    zoomControl: true,
    maxZoom: 10,
    minZoom: 2,
    preferCanvas: true,
  });
  map.setView([34.144, 135.527], 5);

  map.zoomControl.setPosition("topright");
  map.createPane("base").style.zIndex = 40;
  map.createPane("line_pane").style.zIndex = 100;
  map.createPane("eppane").style.zIndex = 150;

  L.tileLayer("//cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: "地図データ：<a href='//www.gsi.go.jp/'>国土地理院</a>",
    maxZoom: 13,
    minZoom: 2,
    pane: "base",
  }).addTo(map);


// GeoJsonファイルの読み込み
//$.getJSON('area.json', function(data) {
//    var geoJson = L.geoJson(data);
//    }).addTo(map);


  map.attributionControl.addAttribution("津波情報：<a href='https://www.jma.go.jp/'>気象庁</a>");

  //震源地アイコンの設定
  epicenter_icon = L.icon({
    iconUrl: "https://hachi-tool0.exp.jp/quake/image/epicenter.png",
    iconSize: [22, 22],
    iconAnchor: [12, 12],
  });

  jma_listget();
});

//津波情報一覧JSON読み込み
function jma_listget() {
  $.getJSON("//www.jma.go.jp/bosai/tsunami/data/list.json?" + new Date().getTime()).done(function (data) {
    let latest_url = "";
    //津波情報のみ
    //「data[i].ift === "発表" &&」を消すと訓練データも表示されます（扱い注意）
    for (let i = 0; i < data.length; i++) {
      if (
        data[i].ift === "発表" &&
        data[i].ttl !== "各地の満潮時刻・津波到達予想時刻に関する情報" &&
        data[i].ttl !== "津波観測に関する情報" &&
        data[i].ttl !== "沖合の津波観測に関する情報"
      ) {
        let oritime = new Date(data[i].at);
        let time = oritime.getDate() + "日 " + oritime.getHours() + "時" + oritime.getMinutes() + "分発表";
        $("#tsunami_selecter").append($("<option>").html(`${time}：${data[i].anm}／${data[i].ttl}`).val(data[i].json));

        if (latest_url !== "") continue;
        latest_url = data[i].json;
      }
    }

    if (latest_url === "") {
      alert("津波データがみつかりませんでした。");
      return;
    }

    jma_tsunamiget(latest_url);
  });
}

//メインのJSON取得&プロット
let fill_layer = undefined;
let epicenter_plot = undefined;
function jma_tsunamiget(url) {
  //すでにfill_layerが使われていたらマップから消去
  if (fill_layer != undefined) {
    map.removeLayer(fill_layer);
  }

  //震源がプロットされていたらマップから消す
  if (epicenter_plot != undefined) {
    map.removeLayer(epicenter_plot);
    epicenter_plot = undefined;
  }

  //津波メインのJSONと地図データ（塗りつぶし）を一緒に読み込む
  //データ切替時に毎回地図データも読み込むのであんまり良いコードではない
  //「//tile.hachi508.com/map_json/japan_tsunami.json」はなるべく自身のサーバーにダウンロードしてお使いください
  //元ファイルは気象庁のページからダウンロードできます（http://www.data.jma.go.jp/developer/gis.html）
  $.when(
    $.getJSON("//www.jma.go.jp/bosai/tsunami/data/" + url + "?" + new Date().getTime()),
    $.getJSON("japan_tsunami.json")
  ).done(function (tdata, mdata) {
    let fill_data = [];

    //津波データをfill_dataに追加
    tdata[0].Body.Tsunami.Forecast.Item.forEach((area_data) => {
      //データをまとめてfill_dataに追加
      let add_obj = {
        code: area_data.Area.Code,
        name: area_data.Area.Name,
        kind: area_data.Category.Kind.Name,
      };
      fill_data.push(add_obj);
    });

    //拡大用に定義
    let bound = L.latLngBounds();

    //塗りつぶし
    let fill_geoobje = topojson.feature(mdata[0], mdata[0].objects.japan_tsunami);
    fill_layer = L.geoJson(fill_geoobje, {
      onEachFeature: function (feature, layer) {
        //震度データがある部分のみ拡大対象にする
        let mapcode = feature.properties.code;
        let code_index = fill_data.findIndex(({ code }) => code === mapcode);
        if (code_index !== -1 && mapcode == fill_data[code_index].code) {
          bound.extend([layer._bounds._northEast, layer._bounds._southWest]);

          //ポップアップ設定
          layer.bindPopup("<p>" + fill_data[code_index].kind + "： " + fill_data[code_index].name + "</p>");
        }
      },
      style: function (feature) {
        //fill_dataを参照し、地図コードが一致する場合はグレードから色と線の太さを参照する
        let fill_color = "#656565";
        let line_width = 7;
        let mapcode = feature.properties.code;
        let code_index = fill_data.findIndex(({ code }) => code === mapcode);
        if (code_index !== -1 && mapcode == fill_data[code_index].code) {
          fill_color = GRADE_COLOR[fill_data[code_index].kind].color;
          line_width = GRADE_COLOR[fill_data[code_index].kind].width;
        }

        return {
          opacity: 1,
          weight: line_width,
          color: fill_color,
          pane: "line_pane",
        };
      },
    }).addTo(map);

    //震源地追加（存在する場合）
    if (tdata[0].Body.Earthquake != undefined) {
      let ep_base = tdata[0].Body.Earthquake[0].Hypocenter.Area.Coordinate;
      let ep_lat = ep_base.slice(0, 5);
      let ep_lon = ep_base.slice(6, 11);
      epicenter_plot = L.marker([parseFloat(ep_lat), parseFloat(ep_lon)], {
        pane: "eppane",
        icon: epicenter_icon,
      });

      let depth_s = ep_base.slice(11);
      depth_s = depth_s.replace("/", "");
      let depth = Math.abs(depth_s / 1000).toString() + "km";
      if (depth_s === "+0") {
        depth = "ごく浅い";
      } else if (depth_s === "" || ep_base === "") {
        depth = "不明";
      } else if (depth_s === "-700000") {
        depth = "700km以上";
      }
      let epcenter = tdata[0].Body.Earthquake[0].Hypocenter.Area.Name;
      let magnitude = tdata[0].Body.Earthquake[0].Magnitude;

      //震源クリックで表示されるテキストを設定
      epicenter_plot.bindPopup(`<p>震源地：${epcenter}<br>深さ：${depth}<br>マグニチュード${magnitude}</p>`, {
        width: "max-content",
      });
      
      //震源追加・ズーム調整
      map.addLayer(epicenter_plot);
      bound.extend(epicenter_plot._latlng);
    }
    
    //拡大
    map.fitBounds(bound);
  });
}
