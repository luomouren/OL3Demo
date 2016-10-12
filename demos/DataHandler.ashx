<%@ WebHandler Language="C#" Class="DataHandler" %>

using System;
using System.Web;
using System.Data;
using System.Data.SqlClient;
using System.Configuration;

public class DataHandler : IHttpHandler {
    
    public void ProcessRequest (HttpContext context) {
        context.Response.ContentType = "text/plain";
        //GET请求的参数获取
        //string geoType = context.Request.QueryString["type"];
        //string geoStr = context.Request.QueryString["geo"];
        //string attStr = context.Request.QueryString["att"];
        //POST请求的参数获取
        string geoType = context.Request.Form["type"];  
        string geoStr = context.Request.Form["geo"];  
        string attStr = context.Request.Form["att"];
        string[] attData = attStr.Split(new char[] { ',' });
        string name = attData[0];
        string city = attData[1];
        string message = null;
        string tableInfo = null;
        SqlConnection cnn = new SqlConnection(ConfigurationManager.AppSettings["DataConStr"]);//建立连接对象
        // SqlConnection cnn = new SqlConnection(ConfigurationManager.ConnectionStrings["DataCnnString"].ConnectionString);
        SqlCommand cmd = new SqlCommand();//建立命令对象
        cmd.Connection = cnn;//设置命令对象的数据连接属性
 
        switch (geoType) { 
        case "Point": 
            tableInfo = "PointsInfo";  //点信息表         
            break;
        case "LineString":
            tableInfo = "LinesInfo";   //线信息表              
            break;
        case "Polygon":
            tableInfo = "PolygonsInfo"; //多边形信息表           
            break;               
        }
        //把SQL语句赋给命令对象
        cmd.CommandText = "insert into " + tableInfo + "(geometry,name,city) values('" + geoStr + "','" + name + "','" + city + "')";
        try
        {
            cnn.Open();//打开连接
            int updateCount = cmd.ExecuteNonQuery();//执行SQL命令
            if (updateCount == 1)
            {
                message = "数据保存成功！";
                context.Response.Write( message );
            }
            else {
                message = "数据保存失败！";
                context.Response.Write( message);
            }
        }
        catch (Exception ex)
        {
            message = "保存失败，错误原因：" + ex.Message;
            context.Response.Write( message );
        }
        finally
        {
            if (cnn.State == ConnectionState.Open)
                cnn.Close();
        }
        
    }
 
    public bool IsReusable {
        get {
            return false;
        }
    }

}