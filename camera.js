//
// Shinobi
// Copyright (C) 2016 Moe Alam, moeiscool
//
//
// # Donate
//
// If you like what I am doing here and want me to continue please consider donating :)
// PayPal : paypal@m03.ca
//
process.on('uncaughtException', function (err) {
    console.error('Uncaught Exception occured!');
    console.error(err.stack);
});
var ffmpegPath = false;
try{
    ffmpegPath = require('ffmpeg-static').path;
}catch(err){
    console.log('No Static FFmpeg. Continuing.')
    //no static ffmpeg
}
var fs = require('fs');
var os = require('os');
var URL = require('url');
var path = require('path');
var mysql = require('mysql');
var moment = require('moment');
var request = require("request");
var express = require('express');
var app = express();
var appHTTPS = express();
var http = require('http');
var https = require('https');
var server = http.createServer(app);
var bodyParser = require('body-parser');
var CircularJSON = require('circular-json');
var ejs = require('ejs');
var io = new (require('socket.io'))();
var execSync = require('child_process').execSync;
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var socketIOclient = require('socket.io-client');
var crypto = require('crypto');
var webdav = require("webdav");
var jsonfile = require("jsonfile");
var connectionTester = require('connection-tester');
var events = require('events');
var Cam = require('onvif').Cam;
var knex = require('knex');
var Mp4Frag = require('mp4frag');
var P2P = require('pipe2pam');
var PamDiff = require('pam-diff');
var chokidar = require('chokidar');
var location = {}
location.super = __dirname+'/super.json'
location.config = __dirname+'/conf.json'
location.languages = __dirname+'/languages'
location.definitions = __dirname+'/definitions'
location.basedir = __dirname;
var config = require(location.config);
if(!config.productType){
    config.productType='CE'
}
if(!config.language){
    config.language='en_CA'
}
try{
    var lang = require(location.languages+'/'+config.language+'.json');
}catch(er){
    console.error(er)
    console.log('There was an error loading your language file.')
    var lang = require(location.languages+'/en_CA.json');
}
try{
    var definitions = require(location.definitions+'/'+config.language+'.json');
}catch(er){
    console.error(er)
    console.log('There was an error loading your language file.')
    var definitions = require(location.definitions+'/en_CA.json');
}
process.send = process.send || function () {};
if(config.mail){
    var nodemailer = require('nodemailer').createTransport(config.mail);
}
//config defaults
if(config.cpuUsageMarker===undefined){config.cpuUsageMarker='%Cpu'}
if(config.customCpuCommand===undefined){config.customCpuCommand=null}
if(config.autoDropCache===undefined){config.autoDropCache=true}
if(config.doSnapshot===undefined){config.doSnapshot=true}
if(config.restart===undefined){config.restart={}}
if(config.systemLog===undefined){config.systemLog=true}
if(config.deleteCorruptFiles===undefined){config.deleteCorruptFiles=true}
if(config.restart.onVideoNotExist===undefined){config.restart.onVideoNotExist=true}
if(config.ip===undefined||config.ip===''||config.ip.indexOf('0.0.0.0')>-1){config.ip='localhost'}else{config.bindip=config.ip};
if(config.cron===undefined)config.cron={};
if(config.cron.deleteOverMax===undefined)config.cron.deleteOverMax=true;
if(config.cron.deleteOverMaxOffset===undefined)config.cron.deleteOverMaxOffset=0.9;
if(config.pluginKeys===undefined)config.pluginKeys={};
if(config.databaseType===undefined){config.databaseType='mysql'}
if(config.databaseLogs===undefined){config.databaseLogs=false}
if(config.pipeAddition===undefined){config.pipeAddition=7}else{config.pipeAddition=parseInt(config.pipeAddition)}

s={factorAuth:{},child_help:false,totalmem:os.totalmem(),platform:os.platform(),s:JSON.stringify,isWin:(process.platform==='win32')};
s.__basedir = __dirname;
var misc = require('./js/misc')({s:s,config:config,io:io});
var ffmpeg = require('./js/ffmpeg')(s,config,misc);
var logging = require('./js/logging')(s,config,misc);
var camera = require('./js/camera')(s,config,ffmpeg,logging,lang,misc,nodemailer);
var connection = require('./js/connection')({s,config,logging,misc,camera,lang});
var screen = require('./js/screen')(s,config,misc,logging);
var pages = require('./js/pages')(s,config,logging,location)
//load languages dynamically
s.loadedLanguages={}
s.loadedLanguages[config.language]=lang;
s.getLanguageFile=function(rule){
    if(rule&&rule!==''){
        var file=s.loadedLanguages[file]
        if(!file){
            try{
                s.loadedLanguages[rule]=require(location.languages+'/'+rule+'.json')
                file=s.loadedLanguages[rule]
            }catch(err){
                file=lang
            }
        }
    }else{
        file=lang
    }
    return file
}
//load defintions dynamically
s.loadedDefinitons={}
s.loadedDefinitons[config.language]=definitions;
s.getDefinitonFile=function(rule){
    if(rule&&rule!==''){
        var file=s.loadedDefinitons[file]
        if(!file){
            try{
                s.loadedDefinitons[rule]=require(location.definitions+'/'+rule+'.json')
                file=s.loadedDefinitons[rule]
            }catch(err){
                file=definitions
            }
        }
    }else{
        file=definitions
    }
    return file
}
var databaseOptions = {
  client: config.databaseType,
  connection: config.db,
}
if(databaseOptions.client.indexOf('sqlite')>-1){
    databaseOptions.client = 'sqlite3';
    databaseOptions.useNullAsDefault = true;
}
if(databaseOptions.client === 'sqlite3' && databaseOptions.connection.filename === undefined){
    databaseOptions.connection.filename = __dirname+"/shinobi.sqlite"
}
s.databaseEngine = knex(databaseOptions)
s.sqlQuery = function(query,values,onMoveOn,hideLog){
    if(!values){values=[]}
    if(typeof values === 'function'){
        var onMoveOn = values;
        var values = [];
    }
    if(!onMoveOn){onMoveOn=function(){}}
    return s.databaseEngine.raw(query,values)
        .asCallback(function(err,r){
            if(err&&config.databaseLogs){
                logging.systemLog('s.sqlQuery QUERY',query)
                logging.systemLog('s.sqlQuery ERROR',err)
            }
            if(onMoveOn)
                if(typeof onMoveOn === 'function'){
                    switch(databaseOptions.client){
                        case'sqlite3':
                            if(!r)r=[]
                        break;
                        default:
                            if(r)r=r[0]
                        break;
                    }
                    onMoveOn(err,r)
                }else{
                    console.log(onMoveOn)
                }
        })
}
if(databaseOptions.client === 'mysql'){
    s.sqlQuery('ALTER TABLE `Videos` ADD COLUMN `details` TEXT NULL DEFAULT NULL AFTER `status`;',function(err){
        if(err){
            logging.systemLog("Critical update 1/2 already applied");
        }
        s.sqlQuery("CREATE TABLE IF NOT EXISTS `Files` (`ke` varchar(50) NOT NULL,`mid` varchar(50) NOT NULL,`name` tinytext NOT NULL,`size` float NOT NULL DEFAULT '0',`details` text NOT NULL,`status` int(1) NOT NULL DEFAULT '0') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",function(err){
            if(err){
                logging.systemLog("Critical update 2/2 NOT applied, this could be bad");
            }else{
                logging.systemLog("Critical update 2/2 already applied");
            }
        },true);
    },true);
}
process.on('exit',ffmpeg.kill.bind(null,{cleanup:true}));
process.on('SIGINT',ffmpeg.kill.bind(null, {exit:true}));
//key for child servers
s.child_nodes={};
s.child_key='3123asdasdf1dtj1hjk23sdfaasd12asdasddfdbtnkkfgvesra3asdsd3123afdsfqw345';

//SSL options
if(config.ssl&&config.ssl.key&&config.ssl.cert){
    config.ssl.key=fs.readFileSync(misc.checkRelativePath(config.ssl.key),'utf8')
    config.ssl.cert=fs.readFileSync(misc.checkRelativePath(config.ssl.cert),'utf8')
    if(config.ssl.port===undefined){
        config.ssl.port=443
    }
    if(config.ssl.bindip===undefined){
        config.ssl.bindip=config.bindip
    }
    if(config.ssl.ca&&config.ssl.ca instanceof Array){
        config.ssl.ca.forEach(function(v,n){
            config.ssl.ca[n]=fs.readFileSync(misc.checkRelativePath(v),'utf8')
        })
    }
    var serverHTTPS = https.createServer(config.ssl,app);
    serverHTTPS.listen(config.ssl.port,config.bindip,function(){
        console.log('SSL '+lang.Shinobi+' - SSL PORT : '+config.ssl.port);
    });
    io.attach(serverHTTPS);
}
//start HTTP
server.listen(config.port,config.bindip,function(){
    console.log(lang.Shinobi+' - PORT : '+config.port);
});
io.attach(server);
console.log('NODE.JS version : '+execSync("node -v"))
//ffmpeg location
if(!config.ffmpegDir){
    if(ffmpegPath !== false){
        config.ffmpegDir = ffmpegPath
    }else{
        if(s.isWin===true){
            config.ffmpegDir = __dirname+'/ffmpeg/ffmpeg.exe'
        }else{
            config.ffmpegDir = 'ffmpeg'
        }
    }
}
s.ffmpegVersion=execSync(config.ffmpegDir+" -version").toString().split('Copyright')[0].replace('ffmpeg version','').trim()
console.log('FFMPEG version : '+s.ffmpegVersion)
if(s.ffmpegVersion.indexOf(': 2.')>-1){
    logging.systemLog('FFMPEG is too old : '+s.ffmpegVersion+', Needed : 3.2+',err)
    return
}
//directories
s.group={};
if(!config.windowsTempDir&&s.isWin===true){config.windowsTempDir='C:/Windows/Temp'}
if(!config.defaultMjpeg){config.defaultMjpeg=__dirname+'/web/libs/img/bg.jpg'}
//default stream folder check
if(!config.streamDir){
    if(s.isWin===false){
        config.streamDir='/dev/shm'
    }else{
        config.streamDir=config.windowsTempDir
    }
    if(!fs.existsSync(config.streamDir)){
        config.streamDir=__dirname+'/streams/'
    }else{
        config.streamDir+='/streams/'
    }
}
if(!config.videosDir){config.videosDir=__dirname+'/videos/'}
if(!config.binDir){config.binDir=__dirname+'/fileBin/'}
if(!config.addStorage){config.addStorage=[]}
s.dir={
    videos:misc.checkCorrectPathEnding(config.videosDir),
    streams:misc.checkCorrectPathEnding(config.streamDir),
    fileBin:misc.checkCorrectPathEnding(config.binDir),
    addStorage:config.addStorage,
    languages:location.languages+'/'
};
//streams dir
if(!fs.existsSync(s.dir.streams)){
    fs.mkdirSync(s.dir.streams);
}
//videos dir
if(!fs.existsSync(s.dir.videos)){
    fs.mkdirSync(s.dir.videos);
}
//fileBin dir
if(!fs.existsSync(s.dir.fileBin)){
    fs.mkdirSync(s.dir.fileBin);
}
//additional storage areas
s.dir.addStorage.forEach(function(v,n){
    v.path=misc.checkCorrectPathEnding(v.path)
    if(!fs.existsSync(v.path)){
        fs.mkdirSync(v.path);
    }
})
////Camera Controller
s.init=function(x,e,k,fn){
    if(!e){e={}}
    if(!k){k={}}
    switch(x){
        case 0://init camera
            if(!s.group[e.ke]){s.group[e.ke]={}};
            if(!s.group[e.ke].fileBin){s.group[e.ke].fileBin={}};
            if(!s.group[e.ke].mon){s.group[e.ke].mon={}}
            if(!s.group[e.ke].sizeChangeQueue){s.group[e.ke].sizeChangeQueue=[]}
            if(!s.group[e.ke].sizePurgeQueue){s.group[e.ke].sizePurgeQueue=[]}
            if(!s.group[e.ke].users){s.group[e.ke].users={}}
            if(!s.group[e.ke].mon[e.mid]){s.group[e.ke].mon[e.mid]={}}
            if(!s.group[e.ke].mon[e.mid].streamIn){s.group[e.ke].mon[e.mid].streamIn={}};
            if(!s.group[e.ke].mon[e.mid].emitterChannel){s.group[e.ke].mon[e.mid].emitterChannel={}};
            if(!s.group[e.ke].mon[e.mid].mp4frag){s.group[e.ke].mon[e.mid].mp4frag={}};
            if(!s.group[e.ke].mon[e.mid].firstStreamChunk){s.group[e.ke].mon[e.mid].firstStreamChunk={}};
            if(!s.group[e.ke].mon[e.mid].contentWriter){s.group[e.ke].mon[e.mid].contentWriter={}};
            if(!s.group[e.ke].mon[e.mid].eventBasedRecording){s.group[e.ke].mon[e.mid].eventBasedRecording={}};
            if(!s.group[e.ke].mon[e.mid].watch){s.group[e.ke].mon[e.mid].watch={}};
            if(!s.group[e.ke].mon[e.mid].fixingVideos){s.group[e.ke].mon[e.mid].fixingVideos={}};
            if(!s.group[e.ke].mon[e.mid].record){s.group[e.ke].mon[e.mid].record={yes:e.record}};
            if(!s.group[e.ke].mon[e.mid].started){s.group[e.ke].mon[e.mid].started=0};
            if(s.group[e.ke].mon[e.mid].delete){clearTimeout(s.group[e.ke].mon[e.mid].delete)}
            if(!s.group[e.ke].mon_conf){s.group[e.ke].mon_conf={}}
            s.init('apps',e)
        break;
        case'group':
            if(!s.group[e.ke]){
                s.group[e.ke]={}
            }
            if(!s.group[e.ke].init){
                s.group[e.ke].init={}
            }
            if(!e.limit||e.limit===''){e.limit=10000}else{e.limit=parseFloat(e.limit)}
            //save global space limit for group key (mb)
            s.group[e.ke].sizeLimit=e.limit;
            //save global used space as megabyte value
            s.group[e.ke].usedSpace=e.size/1000000;
            //emit the changes to connected users
            s.init('diskUsedEmit',e)
        break;
        case'apps':
            if(!s.group[e.ke].init){
                s.group[e.ke].init={};
            }
            if(!s.group[e.ke].webdav||!s.group[e.ke].sizeLimit){
                s.sqlQuery('SELECT * FROM Users WHERE ke=? AND details NOT LIKE ?',[e.ke,'%"sub"%'],function(ar,r){
                    if(r&&r[0]){
                        r=r[0];
                        ar=JSON.parse(r.details);
                        //owncloud/webdav
                        if(ar.webdav_user&&
                           ar.webdav_user!==''&&
                           ar.webdav_pass&&
                           ar.webdav_pass!==''&&
                           ar.webdav_url&&
                           ar.webdav_url!==''
                          ){
                            if(!ar.webdav_dir||ar.webdav_dir===''){
                                ar.webdav_dir='/';
                                if(ar.webdav_dir.slice(-1)!=='/'){ar.webdav_dir+='/';}
                            }
                            s.group[e.ke].webdav = webdav(
                                ar.webdav_url,
                                ar.webdav_user,
                                ar.webdav_pass
                            );
                        }
                        Object.keys(ar).forEach(function(v){
                            s.group[e.ke].init[v]=ar[v]
                        })
                    }
                });
            }
        break;
        case'sync':
            e.cn=Object.keys(s.child_nodes);
            e.cn.forEach(function(v){
                if(s.group[e.ke]){
                   misc.cx({f:'sync',sync:s.init('noReference',s.group[e.ke].mon[e.mid]),ke:e.ke,mid:e.mid},s.child_nodes[v].cnid);
                }
            });
        break;
        case'noReference':
            x={keys:Object.keys(e),ar:{}};
            x.keys.forEach(function(v){
                if(v!=='last_frame'&&v!=='record'&&v!=='spawn'&&v!=='running'&&(v!=='time'&&typeof e[v]!=='function')){x.ar[v]=e[v];}
            });
            return x.ar;
        break;
        case'url':
            //build a complete url from pieces
            e.authd='';
            if(e.details.muser&&e.details.muser!==''&&e.host.indexOf('@')===-1) {
                e.authd=e.details.muser+':'+e.details.mpass+'@';
            }
            if(e.port==80&&e.details.port_force!=='1'){e.porty=''}else{e.porty=':'+e.port}
            e.url=e.protocol+'://'+e.authd+e.host+e.porty+e.path;return e.url;
        break;
        case'url_no_path':
            e.authd='';
            if(!e.details.muser){e.details.muser=''}
            if(!e.details.mpass){e.details.mpass=''}
            if(e.details.muser!==''&&e.host.indexOf('@')===-1) {
                e.authd=e.details.muser+':'+e.details.mpass+'@';
            }
            if(e.port==80&&e.details.port_force!=='1'){e.porty=''}else{e.porty=':'+e.port}
            e.url=e.protocol+'://'+e.authd+e.host+e.porty;return e.url;
        break;
        case'diskUsedEmit':
            //send the amount used disk space to connected users
            if(s.group[e.ke]&&s.group[e.ke].init){
                misc.tx({f:'diskUsed',size:s.group[e.ke].usedSpace,limit:s.group[e.ke].sizeLimit},'GRP_'+e.ke);
            }
        break;
        case'diskUsedSet':
            //`k` will be used as the value to add or substract
            s.group[e.ke].sizeChangeQueue.push(k)
            if(s.group[e.ke].sizeChanging!==true){
                //lock this function
                s.group[e.ke].sizeChanging=true
                //validate current values
                if(!s.group[e.ke].usedSpace){
                    s.group[e.ke].usedSpace=0
                }else{
                    s.group[e.ke].usedSpace=parseFloat(s.group[e.ke].usedSpace)
                }
                if(s.group[e.ke].usedSpace<0||isNaN(s.group[e.ke].usedSpace)){
                    s.group[e.ke].usedSpace=0
                }
                //set queue processor
                var checkQueue=function(){
                    //get first in queue
                    var currentChange = s.group[e.ke].sizeChangeQueue[0]
                    //change global size value
                    s.group[e.ke].usedSpace=s.group[e.ke].usedSpace+currentChange
                    //remove value just used from queue
                    s.group[e.ke].sizeChangeQueue = s.group[e.ke].sizeChangeQueue.splice(1,s.group[e.ke].sizeChangeQueue.length+10)
                    //do next one
                    if(s.group[e.ke].sizeChangeQueue.length>0){
                        checkQueue()
                    }else{
                        s.group[e.ke].sizeChanging=false
                        s.init('diskUsedEmit',e)
                    }
                }
                checkQueue()
            }
        break;
    }
    if(typeof e.callback==='function'){setTimeout(function(){e.callback()},500);}
}
s.filter=function(x,d){
    switch(x){
        case'archive':
            d.videos.forEach(function(v,n){
                s.video('archive',v)
            })
        break;
        case'email':
            if(d.videos&&d.videos.length>0){
                d.videos.forEach(function(v,n){

                })
                d.mailOptions = {
                    from: '"ShinobiCCTV" <no-reply@shinobi.video>', // sender address
                    to: d.mail, // list of receivers
                    subject: lang['Filter Matches']+' : '+d.name, // Subject line
                    html: lang.FilterMatchesText1+' '+d.videos.length+' '+lang.FilterMatchesText2,
                };
                if(d.execute&&d.execute!==''){
                    d.mailOptions.html+='<div><b>'+lang.Executed+' :</b> '+d.execute+'</div>'
                }
                if(d.delete==='1'){
                    d.mailOptions.html+='<div><b>'+lang.Deleted+' :</b> '+lang.Yes+'</div>'
                }
                d.mailOptions.html+='<div><b>'+lang.Query+' :</b> '+d.query+'</div>'
                d.mailOptions.html+='<div><b>'+lang['Filter ID']+' :</b> '+d.id+'</div>'
                nodemailer.sendMail(d.mailOptions, (error, info) => {
                    if (error) {
                        misc.tx({f:'error',ff:'filter_mail',ke:d.ke,error:error},'GRP_'+d.ke);
                        return ;
                    }
                    misc.tx({f:'filter_mail',ke:d.ke,info:info},'GRP_'+d.ke);
                });
            }
        break;
        case'delete':
            d.videos.forEach(function(v,n){
                s.video('delete',v)
            })
        break;
        case'execute':
            exec(d.execute,{detached: true})
        break;
    }
}
s.video=function(x,e){
    if(!e){e={}};
    switch(x){
        case'getDir':
            if(e.mid&&!e.id){e.id=e.mid};
            if(e.details&&(e.details instanceof Object)===false){
                try{e.details=JSON.parse(e.details)}catch(err){}
            }
            if(e.details&&e.details.dir&&e.details.dir!==''){
                return misc.checkCorrectPathEnding(e.details.dir)+e.ke+'/'+e.id+'/'
            }else{
                return s.dir.videos+e.ke+'/'+e.id+'/';
            }
        break;
    }
    var k={}
    if(x!=='getDir'){e.dir=s.video('getDir',e)}
    switch(x){
        case'fix':
            e.sdir=s.dir.streams+e.ke+'/'+e.id+'/';
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            if(e.filename.indexOf('.')===-1){
                e.filename=e.filename+'.'+e.ext
            }
            misc.tx({f:'video_fix_start',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
            s.group[e.ke].mon[e.id].fixingVideos[e.filename]={}
            switch(e.ext){
                case'mp4':
                    e.fixFlags='-vcodec libx264 -acodec aac -strict -2';
                break;
                case'webm':
                    e.fixFlags='-vcodec libvpx -acodec libvorbis';
                break;
            }
            e.spawn=spawn(config.ffmpegDir,('-i '+e.dir+e.filename+' '+e.fixFlags+' '+e.sdir+e.filename).split(' '),{detached: true})
            e.spawn.stdout.on('data',function(data){
                misc.tx({f:'video_fix_data',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
            });
            e.spawn.on('close',function(data){
                exec('mv '+e.dir+e.filename+' '+e.sdir+e.filename,{detached: true}).on('exit',function(){
                    misc.tx({f:'video_fix_success',mid:e.mid,ke:e.ke,filename:e.filename},'GRP_'+e.ke)
                    delete(s.group[e.ke].mon[e.id].fixingVideos[e.filename]);
                })
            });
        break;
        case'archive':
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            if(!e.status){e.status=0}
            e.details.archived="1"
            e.save=[JSON.stringify(e.details),e.id,e.ke,misc.nameToTime(e.filename)];
            s.sqlQuery('UPDATE Videos SET details=? WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(err,r){
                misc.tx({f:'video_edit',status:3,filename:e.filename+'.'+e.ext,mid:e.mid,ke:e.ke,time:misc.nameToTime(e.filename)},'GRP_'+e.ke);
            });
        break;
        case'delete':
            if(!e.filename&&e.time){e.filename=misc.moment(e.time)}
            var filename
            if(e.filename.indexOf('.')>-1){
                filename = e.filename
            }else{
                filename = e.filename+'.'+e.ext
            }
            if(!e.status){e.status=0}
            e.save=[e.id,e.ke,misc.nameToTime(filename)];
            s.sqlQuery('SELECT * FROM Videos WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(err,r){
                if(r&&r[0]){
                    r=r[0]
                    var dir=s.video('getDir',r)
                    s.sqlQuery('DELETE FROM Videos WHERE `mid`=? AND `ke`=? AND `time`=?',e.save,function(){
                        fs.stat(dir+filename,function(err,file){
                            if(err){
                                logging.systemLog('File Delete Error : '+e.ke+' : '+' : '+e.mid,err)
                            }
                            s.init('diskUsedSet',e,-(r.size/1000000))
                        })
                        misc.tx({f:'video_delete',filename:filename,mid:e.mid,ke:e.ke,time:misc.nameToTime(filename),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
                        s.file('delete',dir+filename)
                    })
                }
            })
        break;
        case'open':
            //on video open
            e.save=[e.id,e.ke,misc.nameToTime(e.filename),e.ext];
            if(!e.status){e.save.push(0)}else{e.save.push(e.status)}
            k.details={}
            if(e.details&&e.details.dir&&e.details.dir!==''){
                k.details.dir=e.details.dir
            }
            e.save.push(s.s(k.details))
            s.sqlQuery('INSERT INTO Videos (mid,ke,time,ext,status,details) VALUES (?,?,?,?,?,?)',e.save)
            misc.tx({f:'video_build_start',filename:e.filename+'.'+e.ext,mid:e.id,ke:e.ke,time:misc.nameToTime(e.filename),end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
        break;
        case'close':
            //video function : close
            if(s.group[e.ke]&&s.group[e.ke].mon[e.id]){
                if(s.group[e.ke].mon[e.id].open&&!e.filename){e.filename=s.group[e.ke].mon[e.id].open;e.ext=s.group[e.ke].mon[e.id].open_ext}
                if(s.group[e.ke].mon[e.id].child_node){
                    misc.cx({f:'close',d:s.init('noReference',e)},s.group[e.ke].mon[e.id].child_node_id);
                }else{
                    k.file=e.filename+'.'+e.ext
                    k.dir=e.dir.toString()
                    k.fileExists=fs.existsSync(k.dir+k.file)
                    if(k.fileExists!==true){
                        k.dir=s.dir.videos+'/'+e.ke+'/'+e.id+'/'
                        k.fileExists=fs.existsSync(k.dir+k.file)
                        if(k.fileExists!==true){
                            s.dir.addStorage.forEach(function(v){
                                if(k.fileExists!==true){
                                    k.dir=misc.checkCorrectPathEnding(v.path)+e.ke+'/'+e.id+'/'
                                    k.fileExists=fs.existsSync(k.dir+k.file)
                                }
                            })
                        }
                    }
                    if(k.fileExists===true){
                        k.stat=fs.statSync(k.dir+k.file);
                        e.filesize=k.stat.size;
                        e.filesizeMB=parseFloat((e.filesize/1000000).toFixed(2));
                        e.end_time=misc.moment(k.stat.mtime,'YYYY-MM-DD HH:mm:ss');
                        e.save=[e.filesize,1,e.end_time,e.id,e.ke,misc.nameToTime(e.filename)];
                        if(!e.status){e.save.push(0)}else{e.save.push(e.status)}
                        s.sqlQuery('UPDATE Videos SET `size`=?,`status`=?,`end`=? WHERE `mid`=? AND `ke`=? AND `time`=? AND `status`=?',e.save)
                        misc.txWithSubPermissions({f:'video_build_success',hrefNoAuth:'/videos/'+e.ke+'/'+e.mid+'/'+k.file,filename:k.file,mid:e.id,ke:e.ke,time:moment(misc.nameToTime(e.filename)).format(),size:e.filesize,end:moment(e.end_time).format()},'GRP_'+e.ke,'video_view');

                        //cloud auto savers
                        //webdav
                        if(s.group[e.ke].webdav&&s.group[e.ke].init.use_webdav!=='0'&&s.group[e.ke].init.webdav_save=="1"){
                           fs.readFile(k.dir+k.file,function(err,data){
                               s.group[e.ke].webdav.putFileContents(s.group[e.ke].init.webdav_dir+e.ke+'/'+e.mid+'/'+k.file,"binary",data)
                            .catch(function(err) {
                                   logging.log(e,{type:lang['Webdav Error'],msg:{msg:lang.WebdavErrorText+' <b>/'+e.ke+'/'+e.id+'</b>',info:err},ffmpeg:s.group[e.ke].mon[e.id].ffmpeg})
                                console.error(err);
                               });
                            });
                        }
                        if(s.group[e.ke].init){
                            s.init('diskUsedSet',e,e.filesizeMB)
                            if(config.cron.deleteOverMax===true){
                                //check space
                                s.group[e.ke].sizePurgeQueue.push(1)
                                if(s.group[e.ke].sizePurging!==true){
                                    //lock this function
                                    s.group[e.ke].sizePurging=true
                                    //set queue processor
                                    var finish=function(){
//                                        console.log('checkQueueOne',s.group[e.ke].sizePurgeQueue.length)
                                        //remove value just used from queue
                                        s.group[e.ke].sizePurgeQueue = s.group[e.ke].sizePurgeQueue.splice(1,s.group[e.ke].sizePurgeQueue.length+10)
                                        //do next one
                                        if(s.group[e.ke].sizePurgeQueue.length>0){
                                            checkQueue()
                                        }else{
//                                            console.log('checkQueueFinished',s.group[e.ke].sizePurgeQueue.length)
                                            s.group[e.ke].sizePurging=false
                                            s.init('diskUsedEmit',e)
                                        }
                                    }
                                    var checkQueue=function(){
//                                        console.log('checkQueue',config.cron.deleteOverMaxOffset)
                                        //get first in queue
                                        var currentPurge = s.group[e.ke].sizePurgeQueue[0]
                                        var deleteVideos = function(){
//                                            console.log(s.group[e.ke].usedSpace>(s.group[e.ke].sizeLimit*config.cron.deleteOverMaxOffset))
                                            //run purge command
                                            if(s.group[e.ke].usedSpace>(s.group[e.ke].sizeLimit*config.cron.deleteOverMaxOffset)){
                                                    s.sqlQuery('SELECT * FROM Videos WHERE status != 0 AND details NOT LIKE \'%"archived":"1"%\' AND ke=? ORDER BY `time` ASC LIMIT 2',[e.ke],function(err,evs){
                                                        k.del=[];k.ar=[e.ke];
                                                        evs.forEach(function(ev){
                                                            ev.dir=s.video('getDir',ev)+misc.moment(ev.time)+'.'+ev.ext;
                                                            k.del.push('(mid=? AND time=?)');
                                                            k.ar.push(ev.mid),k.ar.push(ev.time);
                                                            s.file('delete',ev.dir);
                                                            s.init('diskUsedSet',e,-(ev.size/1000000))
                                                            misc.tx({f:'video_delete',ff:'over_max',filename:misc.moment(ev.time)+'.'+ev.ext,mid:ev.mid,ke:ev.ke,time:ev.time,end:misc.moment(new Date,'YYYY-MM-DD HH:mm:ss')},'GRP_'+e.ke);
                                                        });
                                                        if(k.del.length>0){
                                                            k.qu=k.del.join(' OR ');
                                                            s.sqlQuery('DELETE FROM Videos WHERE ke =? AND ('+k.qu+')',k.ar,function(){
                                                                deleteVideos()
                                                            })
                                                        }else{
                                                            finish()
                                                        }
                                                    })
                                            }else{
                                                finish()
                                            }
                                        }
                                        deleteVideos()
                                    }
                                    checkQueue()
                                }
                            }else{
                                s.init('diskUsedEmit',e)
                            }
                        }
                    }else{
                        s.video('delete',e);
                        logging.log(e,{type:lang['File Not Exist'],msg:lang.FileNotExistText,ffmpeg:s.group[e.ke].mon[e.id].ffmpeg})
                        if(e.mode&&config.restart.onVideoNotExist===true&&e.fn){
                            delete(s.group[e.ke].mon[e.id].open);
                            logging.log(e,{type:lang['Camera is not recording'],msg:{msg:lang.CameraNotRecordingText}});
                            if(s.group[e.ke].mon[e.id].started===1){
                                camera.camera('restart',e)
                            }
                        }
                    }
                }
            }
            delete(s.group[e.ke].mon[e.id].open);
        break;
    }
}
s.file=function(x,e){
    if(!e){e={}};
    switch(x){
        case'size':
             return fs.statSync(e.filename)["size"];
        break;
        case'delete':
            if(!e){return false;}
            return exec('rm -f '+e,{detached: true});
        break;
        case'delete_folder':
            if(!e){return false;}
            return exec('rm -rf '+e,{detached: true});
        break;
        case'delete_files':
            if(!e.age_type){e.age_type='min'};if(!e.age){e.age='1'};
            exec('find '+e.path+' -type f -c'+e.age_type+' +'+e.age+' -exec rm -f {} +',{detached: true});
        break;
    }
}

//function for receiving detector data
s.pluginEventController=function(d){
    switch(d.f){
        case'trigger':
            camera.camera('motion',d)
        break;
        case's.tx':
            misc.tx(d.data,d.to)
        break;
        case'sql':
            sql.query(d.query,d.values);
        break;
        case'log':
            logging.systemLog('PLUGIN : '+d.plug+' : ',d)
        break;
    }
}
//multi plugin connections
s.connectedPlugins={}
s.pluginInitiatorSuccess=function(mode,d,cn){
    logging.systemLog('pluginInitiatorSuccess',d)
    if(mode==='client'){
        //is in client mode (camera.js is client)
        cn.pluginEngine=d.plug
        if(!s.connectedPlugins[d.plug]){
            s.connectedPlugins[d.plug]={plug:d.plug}
        }
        logging.systemLog('Connected to plugin : Detector - '+d.plug+' - '+d.type)
        switch(d.type){
            default:case'detector':
                s.ocv={started:moment(),id:cn.id,plug:d.plug,notice:d.notice,isClientPlugin:true};
                cn.ocv=1;
                misc.tx({f:'detector_plugged',plug:d.plug,notice:d.notice},'CPU')
            break;
        }
    }else{
        //is in host mode (camera.js is client)
        switch(d.type){
            default:case'detector':
                s.ocv={started:moment(),id:"host",plug:d.plug,notice:d.notice,isHostPlugin:true};
            break;
        }
    }
    s.connectedPlugins[d.plug].plugged=true
    misc.tx({f:'readPlugins',ke:d.ke},'CPU')
    misc.ocvTx({f:'api_key',key:d.plug})
    s.api[d.plug]={pluginEngine:d.plug,permissions:{},details:{},ip:'0.0.0.0'};
}
s.pluginInitiatorFail=function(mode,d,cn){
    s.connectedPlugins[d.plug].plugged=false
    if(mode==='client'){
        //is in client mode (camera.js is client)
        cn.disconnect()
    }else{
        //is in host mode (camera.js is client)
    }
}
if(config.plugins&&config.plugins.length>0){
    config.plugins.forEach(function(v){
        s.connectedPlugins[v.id]={plug:v.id}
        if(v.enabled===false){return}
        if(v.mode==='host'){
            //is in host mode (camera.js is client)
            if(v.https===true){
                v.https='https://'
            }else{
                v.https='http://'
            }
            if(!v.port){
                v.port=80
            }
            var socket = socketIOclient(v.https+v.host+':'+v.port)
            s.connectedPlugins[v.id].tx = function(x){return socket.emit('f',x)}
            socket.on('connect', function(cn){
                logging.systemLog('Connected to plugin (host) : '+v.id)
                s.connectedPlugins[v.id].tx({f:'init_plugin_as_host',key:v.key})
            });
            socket.on('init',function(d){
                logging.systemLog('Initialize Plugin : Host',d)
                if(d.ok===true){
                    s.pluginInitiatorSuccess("host",d)
                }else{
                    s.pluginInitiatorFail("host",d)
                }
            });
            socket.on('ocv',s.pluginEventController);
            socket.on('disconnect', function(){
                s.connectedPlugins[v.id].plugged=false
                delete(s.api[v.id])
                logging.systemLog('Plugin Disconnected : '+v.id)
                s.connectedPlugins[v.id].reconnector = setInterval(function(){
                    if(socket.connected===true){
                        clearInterval(s.connectedPlugins[v.id].reconnector)
                    }else{
                        socket.connect()
                    }
                },1000*2)
            });
            s.connectedPlugins[v.id].ws = socket;
        }
    })
}
////socket controller
s.cn=function(cn){return{id:cn.id,ke:cn.ke,uid:cn.uid}}
io.on('connection', function(cn){connection.init(cn)});
//Authenticator functions
s.api={};
//auth handler
//params = parameters
//cb = callback
//res = response, only needed for express (http server)
//request = request, only needed for express (http server)
s.auth=function(params,cb,res,req){
    if(req){
        //express (http server) use of auth function
        params.ip=req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        var failed=function(){
            if(!req.ret){req.ret={ok:false}}
            req.ret.msg=lang['Not Authorized'];
            res.end(s.s(req.ret, null, 3));
        }
    }else{
        //socket.io use of auth function
        var failed=function(){
            //maybe log
        }
    }
    var clearAfterTime=function(){
        //remove temp key from memory
        clearTimeout(s.api[params.auth].timeout)
        s.api[params.auth].timeout=setTimeout(function(){
            delete(s.api[params.auth])
        },1000*60*5)
    }
    //check IP address of connecting user
    var finish=function(user){
        if(s.api[params.auth].ip.indexOf('0.0.0.0')>-1||s.api[params.auth].ip.indexOf(params.ip)>-1){
            cb(user);
        }else{
            failed();
        }
    }
    //check if auth key is user's temporary session key
    if(s.group[params.ke]&&s.group[params.ke].users&&s.group[params.ke].users[params.auth]){
        s.group[params.ke].users[params.auth].permissions={};
        cb(s.group[params.ke].users[params.auth]);
    }else{
        //check if key is already in memory to save query time
        if(s.api[params.auth]&&s.api[params.auth].details){
            finish(s.api[params.auth]);
            if(s.api[params.auth].timeout){
               clearAfterTime()
            }
        }else{
            //no key in memory, query db to see if key exists
            //check if using username and password in plain text or md5
            if(params.username&&params.username!==''&&params.password&&params.password!==''){
                s.sqlQuery('SELECT * FROM Users WHERE mail=? AND (pass=? OR pass=?)',[params.username,params.password,misc.md5(params.password)],function(err,r){
                    if(r&&r[0]){
                        r=r[0];
                        r.ip='0.0.0.0';
                        r.auth = misc.gid(20);
                        params.auth = r.auth;
                        r.details=JSON.parse(r.details);
                        r.permissions = {};
                        s.api[r.auth]=r;
                        clearAfterTime();
                        finish(r);
                    }else{
                        failed();
                    }
                })
            }else{
                //not using plain login
                s.sqlQuery('SELECT * FROM API WHERE code=? AND ke=?',[params.auth,params.ke],function(err,r){
                    if(r&&r[0]){
                        r=r[0];
                        s.api[params.auth]={ip:r.ip,uid:r.uid,ke:r.ke,permissions:JSON.parse(r.details),details:{}};
                        s.sqlQuery('SELECT details FROM Users WHERE uid=? AND ke=?',[r.uid,r.ke],function(err,rr){
                            if(rr&&rr[0]){
                                rr=rr[0];
                                try{
                                    s.api[params.auth].mail=rr.mail
                                    s.api[params.auth].details=JSON.parse(rr.details)
                                    s.api[params.auth].lang=s.getLanguageFile(s.api[params.auth].details.lang)
                                }catch(er){}
                            }
                            finish(s.api[params.auth]);
                        })
                    }else{
                        s.sqlQuery('SELECT * FROM Users WHERE auth=? AND ke=?',[params.auth,params.ke],function(err,r){
                            if(r&&r[0]){
                                r=r[0];
                                r.ip='0.0.0.0'
                                s.api[params.auth]=r
                                clearAfterTime()
                                finish(r)
                            }else{
                                failed();
                            }
                        })
                    }
                })
            }
        }
    }
}
//super user authentication handler
s.superAuth=function(x,callback){
    req={};
    req.super=require(location.super);
    req.super.forEach(function(v,n){
        if(x.md5===true){
            x.pass=misc.md5(x.pass);
        }
        if(x.mail.toLowerCase()===v.mail.toLowerCase()&&x.pass===v.pass){
            req.found=1;
            if(x.users===true){
                s.sqlQuery('SELECT * FROM Users WHERE details NOT LIKE ?',['%"sub"%'],function(err,r) {
                    callback({$user:v,users:r,config:config,lang:lang})
                })
            }else{
                callback({$user:v,config:config,lang:lang})
            }
        }
    })
    if(req.found!==1){
        return false;
    }else{
        return true;
    }
}
//login function
s.deleteFactorAuth=function(r){
    delete(s.factorAuth[r.ke][r.uid])
    if(Object.keys(s.factorAuth[r.ke]).length===0){
        delete(s.factorAuth[r.ke])
    }
}

pages.init();

try{
s.cpuUsage=function(e){
    k={}
    switch(s.platform){
        case'win32':
            k.cmd="@for /f \"skip=1\" %p in ('wmic cpu get loadpercentage') do @echo %p%"
        break;
        case'darwin':
            k.cmd="ps -A -o %cpu | awk '{s+=$1} END {print s}'";
        break;
        case'linux':
            k.cmd='LANG=C top -b -n 2 | grep "^'+config.cpuUsageMarker+'" | awk \'{print $2}\' | tail -n1';
        break;
    }
    if(config.customCpuCommand){
      exec(config.customCpuCommand,{encoding:'utf8',detached: true},function(err,d){
          if(s.isWin===true) {
              d = d.replace(/(\r\n|\n|\r)/gm, "").replace(/%/g, "")
          }
          e(d)
      });
    } else if(k.cmd){
         exec(k.cmd,{encoding:'utf8',detached: true},function(err,d){
             if(s.isWin===true){
                 d=d.replace(/(\r\n|\n|\r)/gm,"").replace(/%/g,"")
             }
             e(d)
         });
    } else{
        e(0)
    }
}
s.ramUsage=function(e){
    k={}
    switch(s.platform){
        case'win32':
            k.cmd = "wmic OS get FreePhysicalMemory /Value"
        break;
        case'darwin':
            k.cmd = "vm_stat | awk '/^Pages free: /{f=substr($3,1,length($3)-1)} /^Pages active: /{a=substr($3,1,length($3-1))} /^Pages inactive: /{i=substr($3,1,length($3-1))} /^Pages speculative: /{s=substr($3,1,length($3-1))} /^Pages wired down: /{w=substr($4,1,length($4-1))} /^Pages occupied by compressor: /{c=substr($5,1,length($5-1)); print ((a+w)/(f+a+i+w+s+c))*100;}'"
        break;
        default:
            k.cmd = "LANG=C free | grep Mem | awk '{print $4/$2 * 100.0}'";
        break;
    }
    if(k.cmd){
         exec(k.cmd,{encoding:'utf8',detached: true},function(err,d){
             if(s.isWin===true){
                 d=(parseInt(d.split('=')[1])/(s.totalmem/1000))*100
             }
             e(d)
         });
    }else{
        e(0)
    }
}
    setInterval(function(){
        s.cpuUsage(function(cpu){
            s.ramUsage(function(ram){
                misc.tx({f:'os',cpu:cpu,ram:ram},'CPU');
            })
        })
    },10000);
}catch(err){logging.systemLog(lang['CPU indicator will not work. Continuing...'])}
//check disk space every 20 minutes
if(config.autoDropCache===true){
    setInterval(function(){
        exec('echo 3 > /proc/sys/vm/drop_caches',{detached: true})
    },60000*20);
}
s.beat=function(){
    setTimeout(s.beat, 8000);
    io.sockets.emit('ping',{beat:1});
}
s.beat();
s.processReady = function(){
    logging.systemLog(lang.startUpText5)
    process.send('ready')
}
setTimeout(function(){
    //get current disk used for each isolated account (admin user) on startup
    s.sqlQuery('SELECT * FROM Users WHERE details NOT LIKE ?',['%"sub"%'],function(err,r){
        if(r&&r[0]){
            var count = r.length
            var countFinished = 0
            r.forEach(function(v,n){
                v.size=0;
                v.limit=JSON.parse(v.details).size
                s.sqlQuery('SELECT * FROM Videos WHERE ke=? AND status!=?',[v.ke,0],function(err,rr){
                    ++countFinished
                    if(r&&r[0]){
                        rr.forEach(function(b){
                            v.size+=b.size
                        })
                    }
                    logging.systemLog(v.mail+' : '+lang.startUpText0+' : '+rr.length,v.size)
                    s.init('group',v)
                    logging.systemLog(v.mail+' : '+lang.startUpText1,countFinished+'/'+count)
                    if(countFinished===count){
                        logging.systemLog(lang.startUpText2)
                        ////close open videos
                        s.sqlQuery('SELECT * FROM Videos WHERE status=?',[0],function(err,r){
                            if(r&&r[0]){
                                r.forEach(function(v){
                                    s.init(0,v)
                                    v.filename=misc.moment(v.time);
                                    s.video('close',v);
                                })
                            }
                            logging.systemLog(lang.startUpText3)
                            setTimeout(function(){
                                logging.systemLog(lang.startUpText4)
                                //preliminary monitor start
                                s.sqlQuery('SELECT * FROM Monitors', function(err,r) {
                                    if(err){logging.systemLog(err)}
                                    if(r&&r[0]){
                                        r.forEach(function(v){
                                            s.init(0,v);
                                            r.ar={};
                                            r.ar.id=v.mid;
                                            Object.keys(v).forEach(function(b){
                                                r.ar[b]=v[b];
                                            })
                                            if(!s.group[v.ke]){
                                                s.group[v.ke]={}
                                                s.group[v.ke].mon_conf={}
                                            }
                                            v.details=JSON.parse(v.details);
                                            s.group[v.ke].mon_conf[v.mid]=v;
                                            camera.camera(v.mode,r.ar);
                                        });
                                    }
                                    s.processReady()
                                });
                            },3000)
                        })
                    }
                })
            })
        }else{
            s.processReady()
        }
    })
},1500)
