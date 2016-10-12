<%@ WebHandler Language="C#" Class="RegDataHandler" %>

using System;
using System.Web;
using System.Data;
using System.Data.SqlClient;
using System.Configuration;
using System.IO;
using System.Text;
//using System.Runtime.Serialization.Json;
//using System.Text.RegularExpressions;
using System.Xml;
using System.Data.OleDb;
using Newtonsoft.Json;



public class RegDataHandler : IHttpHandler {
    
    public void ProcessRequest (HttpContext context) {
        context.Response.ContentType = "text/plain";
        int objID = 0; //数据对象ID
        string name = null;
        string city = null;
        
        //POST请求的参数获取
        string opType = context.Request.Form["type"];
        string tableInfo = context.Request.Form["table"];
        string geoStr = context.Request.Form["geo"];
        string attStr = context.Request.Form["att"];
        string fID = context.Request.Form["fID"];
        if (fID != null) {
            objID = Int32.Parse(fID);
        }

        if (attStr != null) { 
            string[] attData = attStr.Split(new char[] { ',' });
            name = attData[0];
            city = attData[1];
        }

        string message = null;
        //string tableInfo = "HotSportsInfo";
        string strSql = "";
        
        SqlConnection cnn = new SqlConnection(ConfigurationManager.AppSettings["DataConStr"]);//建立连接对象                         
        switch (opType)
        {
            case "select":
                
                strSql = "select * from " + tableInfo;
                try {
                    ConnectSQL(cnn);
                    //创建SqlDataAdapter对象，使用select语句和连接对象初始化
                    SqlDataAdapter myCommand = new SqlDataAdapter(strSql, cnn);
                    DataSet ds = new DataSet();
                    //数据集合
                    myCommand.Fill(ds, "热区");
                    DataTable dt = new DataTable();        //数据表
                    dt = ds.Tables["热区"];
                    string result = DataTableToJSON(dt, "obj"); //将数据表数据转换为JSON格式输出
                    context.Response.Write(result);                               
                }
                catch (Exception ex)
                {
                    cnn.Close();
                    context.Response.Write(ex.Message);
                }
                finally
                {
                    if (cnn.State == ConnectionState.Open)
                        cnn.Close();
                }
                    
                break;
            case "insert":
                strSql = "insert into " + tableInfo + "(geometry,name,city) values('" + geoStr + "','" + name + "','" + city + "')";
                SqlCommand cmd = new SqlCommand();//建立命令对象
                cmd.Connection = cnn;//设置命令对象的数据连接属性
                //把插入SQL语句赋给命令对象
                cmd.CommandText = strSql;
                try
                {
                    ConnectSQL(cnn);
                    int updateCount = cmd.ExecuteNonQuery();//执行SQL命令
                    if (updateCount == 1)
                    {
                        message = "数据保存成功！";
                        context.Response.Write(message);
                    }
                    else
                    {
                        message = "数据保存失败！";
                        context.Response.Write(message);
                    }
                }
                catch (Exception ex)
                {
                    message = "保存失败，错误原因：" + ex.Message;
                    context.Response.Write(message);
                }
                finally
                {
                    if (cnn.State == ConnectionState.Open)
                        cnn.Close();
                }                                           
                break;
            case "delete":
                strSql = "delete from " + tableInfo + " where  ID = " + objID;
                SqlCommand cmd2 = new SqlCommand();//建立命令对象
                cmd2.Connection = cnn;//设置命令对象的数据连接属性
                //把插入SQL语句赋给命令对象
                cmd2.CommandText = strSql;
                try
                {
                    ConnectSQL(cnn);
                    int updateCount = cmd2.ExecuteNonQuery();//执行SQL命令
                    if (updateCount == 1)
                    {
                        message = "数据删除成功！";
                        context.Response.Write(message);
                    }
                    else
                    {
                        message = "数据删除失败！";
                        context.Response.Write(message);
                    }
                }
                catch (Exception ex)
                {
                    message = "保存失败，错误原因：" + ex.Message;
                    context.Response.Write(message);
                }
                finally
                {
                    if (cnn.State == ConnectionState.Open)
                        cnn.Close();
                }
                break;
        }             
    }
    /// <summary>         

    /// 打开数据库         

    /// </summary>         

    /// <param name="conn"></param>         

    /// <returns></returns>      
    protected static void ConnectSQL(SqlConnection conn)
    {
        if (conn.State == ConnectionState.Closed)
        {
            conn.Open();
        }
        else if (conn.State == ConnectionState.Broken)
        {
            conn.Close();
            conn.Open();
        }
    }

    ///// <summary>        
    ///// 将对象序列化成Json格式字符串         
    ///// </summary>         
    ///// <typeparam name="T"></typeparam>        
    ///// <param name="t"></param>         
    ///// <returns></returns>        
    //public static string JsonSerializer<T>(T t)
    //{
    //    DataContractJsonSerializer zer = new DataContractJsonSerializer(typeof(T));
    //    MemoryStream ms = new MemoryStream();
    //    zer.WriteObject(ms, t);
    //    string jsonstring = Encoding.UTF8.GetString(ms.ToArray());
    //    ms.Close();
    //    return jsonstring;
       
    //}

    ///// <summary>        
    ///// 将对象序列化成Json格式字符串         
    ///// </summary>            
    ///// <param name="dt"></param>
    ///// <param name="dtName"></param>          
    ///// <returns></returns> 
    private static string DataTableToJSON(DataTable dt, string dtName)
    {
        System.Text.StringBuilder sb = new StringBuilder();
        System.IO.StringWriter sw = new System.IO.StringWriter(sb);
        using (JsonWriter jw = new JsonTextWriter(sw))
        {
            JsonSerializer ser = new JsonSerializer();
            jw.WriteStartObject();
            jw.WritePropertyName(dtName);
            jw.WriteStartArray();
            foreach (DataRow dr in dt.Rows)
            {
                jw.WriteStartObject();
                foreach (DataColumn dc in dt.Columns)
                {
                    jw.WritePropertyName(dc.ColumnName);
                    ser.Serialize(jw, dr[dc].ToString());
                }
                jw.WriteEndObject();
            }
            jw.WriteEndArray();
            jw.WriteEndObject();
            sw.Close();
            jw.Close();
        }
        return sb.ToString();
    }
    
    
    public bool IsReusable {
        get {
            return false;
        }
    }

}