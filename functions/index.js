
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const keys = require('./credentials.json')
const {google} = require('googleapis')
const express = require("express");
const moment = require("moment")
const firebase = require('firebase');
const ejs = require('ejs');
const pdf = require('html-pdf');
require('firebase/storage')
const cors = require("cors");
const app = express();
app.use(cors());

app.set("view engine","ejs");
app.engine('ejs', require('ejs').__express);

app.set('port', (process.env.PORT || 5501))
global.XMLHttpRequest = require("xhr2");

firebase.initializeApp(keys.firebase);
var storage = firebase.storage();
var storageRef = storage.ref();

let seconds = new Date().getTime()

let date = moment(seconds).utcOffset('+0700').format('DD-MM-YYYY')
let nowDate = moment(seconds).utcOffset('+0700').format("DD/MM/YYYY HH:mm")

const client = new google.auth.JWT(
  keys.client_email, 
  null, 
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);


async function getImages() {

  var listRef = storageRef.child(`${date}/images`)
  let listImage = []
  return listRef.listAll().then(async result => {
      let data = await (result && result.items).reduce(async (o, pic, key) => {
        const url = await pic.getDownloadURL();
        listImage[key] = url;
        o[key] = url;
        return o;
      },[]);
      return listImage
  });
}



async function gsrun(cl){

  const gsapi = google.sheets({version:'v4', auth: cl});
  const opt = keys.opt;

  let data = await gsapi.spreadsheets.values.get(opt);
  let dataArray = data.data.values;

  return dataArray;
}

app.get('/',async  (req, res) => {
  return client.authorize(async (err,tokens) =>{
    if(err){
      console.log(err);
      return;
    } else {
      let data = await gsrun(client)
      let image = await getImages();
      let showTable = [];
      showTable.push(data[0]);
      for(var i = 1; i< data.length; i++){
        if(data[i][6].includes(['Delay'])){
          showTable.push(data[i])
        }
      }
      return res.render(__dirname+'/index.ejs', { 
        data: showTable, 
        Date: nowDate,
        image: image || []
      })
    }
  });
})

app.get('/pdf',async  (req, res) => {
  return client.authorize(async (err,tokens) =>{
    if(err){
      console.log(err);
      return;
    } else {
      let data = await gsrun(client)
      let image = await getImages();
      let showTable = [];
      showTable.push(data[0]);
      for(var i = 1; i< data.length; i++){
        if(data[i][6].includes(['Delay'])){
          showTable.push(data[i])
        }
      }
      var options = { 
        format: 'A4',
        "footer": {
          "height": "28mm"
        },
        "header": {
          "height": "22mm"
        },
      };
      ejs.renderFile(__dirname+'/index.ejs', 
        {  data: showTable, Date: nowDate, image: image || []}, async (err, result) =>{
        if (result) {
          html = result;
        }
        else {
          res.end('An error occurred');
          console.log(err);
        }
        let nameFile = `Sheet${moment(seconds).format("DD-MM-YYYYHH-mm")}`;
        const metadata = {
          contentType: 'application/pdf'
        };
        pdf.create(html,options).toBuffer(async (error, buffer)=>{
          var pdfRef = storageRef.child(`${date}/pdf/${nameFile}.pdf`).put(buffer,metadata);
          await pdfRef.on('state_changed', (snapshot)=>{
            var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
            switch (snapshot.state) {
              case firebase.storage.TaskState.PAUSED: // or 'paused'
                console.log('Upload is paused');
                break;
              case firebase.storage.TaskState.RUNNING: // or 'running'
                console.log('Upload is running');
                break;
            }
            
          },(error) =>{
            console.log('ERROR::',error)
          },async ()=>{
            let downloadURL = await pdfRef.snapshot.ref.getDownloadURL();
            // console.log('File available at', downloadURL);
            return res.redirect(`${downloadURL}`);
          });
        });
        // pdf.create(html,options).toFile(__dirname+`/pdf/${nameFile}.pdf`,  (err, result) =>{
        //   if (err) return res.status(500).json({
        //     message: 'Create pdf error.'
        //   })
        //   res.download(`${__dirname}/pdf/${nameFile}.pdf`);
        // });
      });
    }
  })
})

exports.NodeSheet = functions.https.onRequest(app)
// app.listen(app.get('port'), () =>{
// 	console.log("🚀 Server ready ~~~~")
// })