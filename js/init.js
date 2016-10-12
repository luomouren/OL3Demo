

/** 左侧下拉菜单控制 **/

$(".leftsidebar_box dt img").attr("src", "images/left/select_xl01.png");
$(function () {
    $(".leftsidebar_box dd").hide(); //隐藏
    /**系统默认显示第一行菜单**/
    $(".first_dt").parent().find('dd').show(); // 默认显示第一行菜单
    $(".first_dt img").attr("src", "images/left/select_xl.png"); //当前焦点一级菜单项图标
    $(".first_dt").css({ "background-color": "#1f6b75" }); // 焦点一级菜单项的样式
    /**一级菜单项单击事件**/
    $(".leftsidebar_box dt").click(function () {
        //判断当前一级菜单下的二级菜单项是否隐藏
        if ($(this).parent().find('dd').is(":hidden")) {
            $(this).parent().find('dd').slideToggle(); //滑动方式展开子菜单
            $(this).css({ "background-color": "#1f6b75" }); //焦点一级菜单项背景颜色             
            $(this).parent().find('img').attr("src", "images/left/select_xl.png"); //当前焦点一级菜单项图标                 
        }
        else {
            $(this).parent().find('dd').slideUp(); //滑动方式隐藏子菜单
            $(this).css({ "background-color": "#339999" }); //非焦点一级菜单项背景颜色
            $(this).parent().find('img').attr("src", "images/left/select_xl01.png"); //非焦点一级菜单项图标
        }
    });


    //            $(".leftsidebar_box dt").click(function () {
    //                $(".leftsidebar_box dd").hide(); //隐藏
    //                $(".leftsidebar_box dt").css({ "background-color": "#339999" }); //非焦点一级菜单项背景颜色
    //                $(this).css({ "background-color": "#1f6b75" }); //焦点一级菜单项背景颜色             
    //                $(".leftsidebar_box dt img").attr("src", "images/left/select_xl01.png"); //非焦点一级菜单项图标
    //                $(this).parent().find('img').attr("src", "images/left/select_xl.png"); //当前焦点一级菜单项图标
    //                $(this).parent().find('dd').slideToggle(); //当前二级菜单滑动展开显示
    //                //$(this).parent().find('dd').removeClass("menu_choice");//移除当前二级菜单项的选中样式
    //                //$(".menu_choice").slideUp();//滑动方式隐藏
    //                //$(this).parent().find('dd').addClass("menu_choice");//为焦点一级菜单下选中二级菜单项设置选中样式
    //            });   

    /**二级菜单项单击事件**/
    $(".leftsidebar_box dd").click(function () {
        $(".leftsidebar_box dd").css({ "background-color": "#4c4e5a", "color": "#f5f5f5" }); //二级菜单项背景颜色
        $(this).css({ "background-color": "#38393F", "color": "#a9a9a9" }); //选中项二级菜单项背景颜色
    });

    //            /**二级菜单项鼠标悬停事件**/
    //            $(".leftsidebar_box dd").hover(function () {
    //                $(this).css({ "background-color": "#38393F", "color":"#a9a9a9"});
    //            }, function () {
    //                $(this).css({ "background-color": "#4c4e5a", "color": "#f5f5f5" });
    //            });

})
/**系统初始默认页面源码显示 **/
$(function () {
    setCore("OSM", "MultiData"); //显示默认页面的源码
})

/** 二级菜单项对应功能页面的源码显示 **/
function setCore(name, catalog) {
    var pageName = name;
    var htmlUrl = "demos/" + catalog +"/" + pageName + ".htm"; //请求的页面
    var htmlString = ""; //请求页面的代码（字符串形式）
    jQuery.ajax({
        async: false,
        url: htmlUrl,
        success: function (result) {
            htmlString = result;
        }
    });
    $('#codes').val(htmlString); //设置源码到源码容器的textarea控件中
    initEditor(); //源码高亮显示(源码样式显示)
    $('#container_iframe').attr("src", htmlUrl); //设置右侧容器的页面地址   
}


/** 源码控制 **/
$(function () {
    initEditor(); //源码高亮显示
    initCopy(); //复制源码

    //源码域显示/隐藏控制
    var iCodeWidth = 468,
	        oArrow = $('#code_arrow'),
	        oCodeCore = $('#code_core'),
            oIframeWrapper = $('div.iframe_wrapper'),
	        iIframeMargin = parseInt(oIframeWrapper.css('margin-left'));
    oArrow.click(function () {
        if (oArrow.hasClass('go_back')) {
            oCodeCore.animate({ width: 0 });
            oIframeWrapper.animate({ marginLeft: iIframeMargin - iCodeWidth });
            oArrow.removeClass('go_back');
        } else {
            oCodeCore.animate({ width: iCodeWidth });
            oIframeWrapper.animate({ marginLeft: iIframeMargin });
            oArrow.addClass('go_back');
        }
    });
})

/** 源码读取显示 **/
var sCopyTarget = "#codes";
localStorage.code = $(sCopyTarget).val();
//源码高亮显示
var editor = null;
function initEditor() {
    if (!editor) {
        editor = CodeMirror.fromTextArea(document.getElementById("codes"), {
            lineWrapping: true, //是否显示scroll
            lineNumbers: true, //是否显示number
            styleActiveLine: true,
            matchBrackets: true,
            mode: "htmlmixed", //样式类型
            viewportMargin: Infinity
        });
    } else {
        editor.setValue($(sCopyTarget).val());
    }
}
/** 代码复制功能 **/
function sCopy() {
    var iframeContent = $(sCopyTarget).val();
    if (editor) {
        iframeContent = editor.getValue();
    }
    return iframeContent;
}
function initCopy() {
    var iframeContent = $(sCopyTarget).val();
    var oClip = new ZeroClipboard($('#code_copy'));
    oClip.on('ready', function (event) {
        oClip.on('copy', function (event) {
            event.clipboardData.setData('text/plain', sCopy());
        });
        oClip.on('aftercopy', function (event) {
            alert('代码已成功复制到粘贴板 :)');
        });
    });
    oClip.on('error', function (event) {
        ZeroClipboard.destroy();
    });
}