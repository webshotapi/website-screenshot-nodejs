'use strict';
/**
 * 
 */
const EventEmitter = require("events");
const fetch = require('node-fetch');
const fs = require('fs');



class Webshotapi extends EventEmitter {
    /**
     * Constructor for Client API in NodeJS
     * 
     * @constructor
     * @param {string} api_key api key from https://webshotapi.com/dashboard/api/
     * @param {string} version api version
     * @param {string} max_concurrency how many requests client send to server in same time
     */
    constructor(api_key, max_concurrency = 2, version='v1'){
        super();
        
        this.server_version_path = version+'/';
        this.server_url = 'https://api.webshotapi.com/';

        this.max_concurrency = max_concurrency;
        this.api_key = api_key;
        
        this.timeout_connection = 10;
        this.timeout = 30;

        this.request_remaining = 0;
        this.multi_running = 0;
        this.multi_total = 0;
        this.multi_completed = 0;
        this.multi_monitor_interval = null;

        this.multi_requests = [];
        this.multi_enabled = false;
        this.version = '1.0.0';
    }
    
 
    /**
     * Make request for api
     * @param {string} url website url 
     * @param {string} path api method name
     * @param {string} method http method (POST,GET)
     * @param {Object} params Object with params from webshotapi.com/docs/
     * @param {Object} headers_manual Can add manual headers
     * @return {object} Result object
     */
    async request(url, path, method, params={}, headers_manual={}){
       
            return new Promise(async(resolve, reject) => {

                //create url for request
                let request_url = this.server_url + this.server_version_path + path;

                if(!this.api_key){
                    throw new Error('Please set your api key first');
                }
                
                if(!method){
                    throw new Error("You have to set method for api");
                }

                //add url if set
                if(url){
                    params.link = url;
                }
        
                var that = this;
                let headers = {
                    'Content-Type': 'application/json',
                    'User-Agent':'WebshotApi Client NodeJS ' + this.version,
                    'Authorization': 'Bearer '+this.api_key
                };

                if(headers_manual){
                    headers = Object.assign(headers, headers_manual);
                }

                fetch(request_url, {
                    method: method, // *GET, POST, PUT, DELETE, etc.
                    mode: 'cors', // no-cors, *cors, same-origin
                    cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
                    credentials: 'same-origin', // include, *same-origin, omit
                    headers: headers,
                    timeout_connection: this.timeout_connection * 1000,
                    timeout: this.timeout * 1000,
                    compress: true,
                    redirect: 'follow', // manual, *follow, error
                    referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
                    body: method!='GET' ? JSON.stringify(params):null // body data type must match "Content-Type" header
                }).then(async(response)=>{
                    
                    var data = null;
                    var error = null;
                    var binary_file = false;
                    
                    var result = new Result();
                    result.url = url;

                    result.response_headers = new fetch.Headers(response.headers);

                    //get request remaning
                    if(result.response_headers.has('X-Quota-Remaining')){
                        that.request_remaining = result.response_headers.get('X-Quota-Remaining');
                    }

                    if(response.status==401){
                        return reject("Unauthorized client. Check your authorization token");
                    }

                    if(response.status==404){
                        return reject("404 ERROR. Can't find item");
                    }

                    if(response.status==403){
                        return reject("Access deneid");
                    }

          
                    if(result.response_headers.has('content-type')){
                        const contentType = result.response_headers.get('content-type');

                        result.content_type = null;

                        if(contentType.includes('json')){
                            data = await response.json();    
                            if(typeof(data['errors']) !=="undefined"){
                                error = data['errors'];
                            } 
                            result.body = data;
                            result.content_type = 'application/json';
                        }else if(contentType.includes('application/pdf')){
                            result.content_type = 'application/pdf';
                            binary_file = true;
                        }else if(contentType.includes('image/jpeg')){
                            result.content_type = 'image/jpeg';
                            binary_file = true;
                        }else if(contentType.includes('image/png')){
                            result.content_type = 'image/png';
                            binary_file = true;
                        }else if(contentType.includes('text/plain')){ 
                            data = response.body;
                            result.content_type = 'text/plain';
                            binary_file = false;
                            result.body = data;
                        }

                        if(binary_file){
                            data = response.body;
                            result.body = await response.buffer();
                        }

                        
                        if(!result.content_type){
                            return reject("Unknown response content type");
                        }

                        result.http_code = response.status;
                                     
                    }else{
                        reject('Unkown content type');
                    }

                    if(error){
                        reject(error);
                    }
    
                    if(response.status != 200 && response.status != 500){
                        var c = ""+(binary_file?error:data);
                        //throw new Error("Error code: "+response.status+" Message: "+c);
                        reject(c);
                    }
    
                    if(response.status == 500){
                        var c = ""+(binary_file?error:data);
                        //throw new Error("Internal error. Message: "+c);
                        reject(c);
                    }
                
                    resolve(result);
                
                }).catch((e)=>{
                    reject(e);
                });

                
            });
        
    
    }

    /**
     * Take website screenshot and return PDF file
     * @param {string} link website link 
     * @param {object} params params for api from https://webshotapi.com/docs/
     * @example
     * 
     * 
//Image download
const TOKEN = "YOUR TOKEN HERE";
(async()=>{
    try{
        const client = new Webshotapi(TOKEN);
        const result = await client.screenshot_pdf('https://www.example.com', {
            remove_modals:1,
            'width': 1920,
            'no_cache': 1
        });
        
        #save screenshot to file
        await result.save('/tmp/screenshot_test.pdf');
    }catch(e){
        console.log("Error", e);
    }
})();
     */
    async pdf(link, params){
        if(this.multi_enabled){
            this.multi_requests.push([link,'screenshot/pdf','POST',params]);
            return this;
        }
        return await this.request(link,'screenshot/pdf','POST',params);
    }

    /**
     * Take website screenshot and return JPG file
     * @param {string} link website link 
     * @param {object} params params for api from https://webshotapi.com/docs/
     * @example
     * 
     * 
//Image download
const TOKEN = "YOUR TOKEN HERE";
(async()=>{
    try{
        const client = new Webshotapi(TOKEN);
        const result = await client.screenshot_jpg('https://www.example.com', {
            remove_modals:1,
            'width': 1920,
            'no_cache': 1
        });
        
        #save screenshot to file
        await result.save('/tmp/screenshot_test.jpg');
    }catch(e){
        console.log("Error", e);
    }
})();
     */
    async screenshot_jpg(link, params){
        if(this.multi_enabled){
            this.multi_requests.push([link,'screenshot/jpg','POST',params]);
            return this;
        }
        return await this.request(link,'screenshot/jpg','POST',params);
    }

    /**
     * Take website screenshot and return PNG file
     * @param {string} link website link 
     * @param {object} params params for api from https://webshotapi.com/docs/
     * @example
     * 
     * 
//Image download
const TOKEN = "YOUR TOKEN HERE";
(async()=>{
    try{
        const client = new Webshotapi(TOKEN);
        const result = await client.screenshot_png('https://www.example.com', {
            remove_modals:1,
            'width': 1920,
            'no_cache': 1
        });
        
        #save screenshot to file
        await result.save('/tmp/screenshot_test.png');
    }catch(e){
        console.log("Error", e);
    }
})();
*/
    async screenshot_png(link, params){
        if(this.multi_enabled){
            this.multi_requests.push([link,'screenshot/png','POST',params]);
            return this;
        }
        return await this.request(link,'screenshot/png','POST',params);
    }

    /**
     * Take website screenshot and return JSON file
     * @param {string} link website link 
     * @param {object} params params for api from https://webshotapi.com/docs/
     */
    async screenshot_json(link, params){
        if(this.multi_enabled){
            this.multi_requests.push([link,'screenshot/json','POST',params]);
            return this;
        }
        return await this.request(link,'screenshot/json','POST',params);
    }

    /**
     * You can extract from website: 
     * - all selectors with positions(x,y,width,height,css styles)
     * - all words with (x,y,width,height, offset in parent element). After that you can make website words map(heatmap)
     * @param {string} link website link 
     * @param {object} params params for api from https://webshotapi.com/docs/
     * @example
//Image download
const TOKEN = "cf27061b4446b0a5f152d3589c21239e";
(async()=>{
    try{
        const client = new Webshotapi(TOKEN);
        const result = await client.extract('https://www.example.com', {
            "remove_modals": 1,
            "ads": 1,
            "width": 320,
            "height": 960,
            "no_cache": 0,
            "scroll_to_bottom": 1,
            "retina": 0,
            "delay": "",
            "wait_for_selector": "",
            "wait_for_xpath": "",
            "image_quality": 75,
            "transparent_background": 1,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
            "accept_language": "en/GB",
            "cookies": "user=1&last_visit=2020-12-09",
            "headers": "X-hello=value;X-var=value",
            "full_page": 1,
            "timezone": "Europe/Paris",
            "fail_statuscode": "403,404, 500-511",
            "extract_selectors": 1,
            "extract_words": 0,
            "extract_style": 0,
            "extract_text": 1,
            "extract_html": 0,
            "capture_element_selector": "",
            "injection_css": ".price{color:red;}",
            "injection_css_url": "https://webshotapi.com/css/my_style.css",
            "injection_js": "document.querySelector(\"#ads\").style.display=\"none\";",
            "thumbnail_width": 128
            });
        
        #get json data
        let data = result.json();
        
        #save data to file
        result.save('/tmp/test.json');
    }catch(e){
        console.log("Error", e);
    }
   
})();

     */
    async extract(link, params){
        if(this.multi_enabled){
            this.multi_requests.push([link,'extract','POST',params]);
            return this;
        }
        return await this.request(link,'extract','POST',params);
    }

    /**
     * Get all projects
     * @return array
     */
    async projects(){
        if(this.multi_enabled){
            this.multi_requests.push([null,'projects','POST',{}]);
            return this;
        }
        return await this.request(null,'projects','GET',{});
    }

    /**
     * Return project by id
     * @param {int} id project id
     * @return object 
     */
    async project(id){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project/'+id,'GET',{}]);
            return this;
        }
        return await this.request(null,'project/'+id,'GET',{});
    }

    /**
     * Remove project
     * @param {int} id 
     */
    async project_delete(id){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project/'+id,'DELETE',{}]);
            return this;
        }
        return await this.request(null,'project/'+id,'DELETE',{});
    }
    /**
     * Create new project
     * @param {object} params 
     */
    async project_create(params){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project','POST',params]);
            return this;
        }
        return await this.request(null,'project','POST',params);
    }

    /**
     * Update exists project
     * 
     * @param {int} id project id 
     * @param {object} params - info about parameters https://webshotapi.com/docs/
     */
    async project_update(id,params){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project/'+id,'PUT',params]);
            return this;
        }
        return await this.request(null,'project/'+id,'PUT',params);
    }

    /**
     * Add new urls to project
     * @param {int} id project id
     * @param {object} params parameters to send info about parameters https://webshotapi.com/docs/
     */
    async project_create_url(id, urls, params){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project/'+id+'/urls','POST',{'urls':urls,'params':params}]);
            return this;
        }
        return await this.request(null,'project/'+id+'/urls','POST',{'urls':urls,'params':params});
    }

    /**
     * Add new urls to project
     * 
     * @param {int} id project id 
     * @param {int} url_id after add new url you will get uniq id for each link
     * @return {object} return reference to main object or if is not multi requests mode return project remove data
     */
    async project_delete_url(id, url_id){
        if(this.multi_enabled){
            this.multi_requests.push([null,'project/'+id+'/urls/'+url_id,'DELETE',{}]);
            return this;
        }

        return await this.request(null,'project/'+id+'/urls/'+url_id,'DELETE',{});
    }

    /**
     * Get urls list added to project. List are pagination to 100 urls per page
     * 
     * @param {int} id project id
     * @param {int} page number of page.
     * @return Promise
     */
    async project_urls(id,page=1){
        if(this.multi_enabled){
            this.multi_requests.push([null, 'project/'+id+'/urls/'+page,'GET',{}]);
            return this;
        }
        return await this.request(null, 'project/'+id+'/urls/'+page,'GET',{});
    }

    /**
     * Get info about account. Return info about free requests etc.
     * 
     * @return {object} return info from server about your account and subscription
     */
    async info(){
        return await this.request(null,'info', 'GET', {})
    }

    /**
     * Get requests remaining from last request made
     * 
     * @return {integer} return how much requests is available in you subscription
     */
    get_request_remaining(){
        return this.request_remaining;
    }

    __sleep(ms){
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Get multi requests stats
     * @return {object} return multi requests stats
     */
    multi_stats(){
        return {
            'total': this.multi_total,
            'completed': this.multi_completed,
            'running': this.multi_running,
            'max_concurrency': this.max_concurrency
        }
    }

    /**
     * Show multi requests monitor
     * 
     * @param {bool} console_clear clear console output
     * @return {string} send to stdout string info
     */
    multi_monitor(console_clear=true){
        //show stats
        this.multi_monitor_interval = setInterval(()=>{
            if(console_clear){
                console.clear(); 
            }
          
            var stats = this.multi_stats();
            if(stats.completed >= stats.total && this.multi_monitor_interval){
                clearInterval(this.multi_monitor_interval);
            }
            process.stdout.write("Total: "+stats.completed+"/"+stats.total+" Running: "+stats.running+" Max concurrency: "+stats.max_concurrency+"\n");
        },150);
    }

    /**
     * Start multi requests mode. In this mode you can send multiple requests to server in same time (concurrent requests)
     * 
     * @param {bool} enabled - multi request enabled. If enabled method clear multi requests queue
     * @return {object}
     * @example
     * 
     * 
        const client = new Webshotapi(YOUR_API_TOKEN, max_concurrency=4);

        //create multi requests mode 
        const pipeline = client.multi();
       
        //add request to pipeline like normal function
        pipeline.pdf('https://www.cnn.com',{
            no_cache:1,
            remove_modals:1,
        });

        //add one more
        pipeline.screenshot_jpg('https://www.example.com',{
            no_cache:1,
            remove_modals:1,
        });

        //add one more
        pipeline.screenshot_jpg('https://www.google.com',{
            no_cache:1,
            remove_modals:1,
        });


        //add one more
        pipeline.extract('https://www.google.com',{
            extract_selectors: 1,
        });

        //on Request completed listener
        client.on('onRequestCompleted', async(return_data, request_data, request_index) => {
           
            console.log("Request OK: "+request_data.link);

            //set path to save. Client has auto detect file extension method.
            await return_data.save('/tmp/file_'+request_index);
            console.log("File saved");
            console.log("Request remaning in your subscription: "+ client.get_request_remaining());
        });
        
        //on Request error listener
        client.on('onRequestError', (error_data, request_data, request_index) => {
            console.log('RequestError: '+ request_data.link);
            console.log(error_data);
        });

        //execute multi requests
        client.exec();

     */
    multi(enabled=true){
        this.multi_enabled = enabled;
        if(enabled){
            this.multi_requests = [];
        }

        return this;
    }

    /**
     * Run multi requests queue
     * 
     * @fires onRequestCompleted on request completed
     * @fires onRequestError on request error
     * @example
     * 
     * 
        const client = new Webshotapi(YOUR_API_TOKEN, max_concurrency=4);

        //create pipeline
        const pipeline = client.multi();
       
        //add request to pipeline like normal function
        pipeline.pdf('https://www.cnn.com',{
            no_cache:1,
            remove_modals:1,
        });

        //add one more
        pipeline.screenshot_jpg('https://www.example.com',{
            no_cache:1,
            remove_modals:1,
        });

        //add one more
        pipeline.screenshot_jpg('https://www.google.com',{
            no_cache:1,
            remove_modals:1,
        });


        //add one more
        pipeline.extract('https://www.google.com',{
            extract_selectors: 1,
        });

        //on Request completed listener
        client.on('onRequestCompleted', async(return_data, request_data, request_index) => {
           
            console.log("Request OK: "+request_data.link);

            //set path to save. Client has auto detect file extension method.
            await return_data.save('/tmp/file_'+request_index);
            console.log("File saved");
            console.log("Request remaning in your subscription: "+ client.get_request_remaining());
        });
        
        //on Request error listener
        client.on('onRequestError', (error_data, request_data, request_index) => {
            console.log('RequestError: '+ request_data.link);
            console.log(error_data);
        });

        //execute multi requests
        client.exec();
     */
    async exec(){
        let that=this;
        
        this.multi_total += this.multi_requests.length;

        try {
            for(var k=0;k<this.multi_requests.length;k++){
                
                while(this.multi_running >= this.max_concurrency){
                    await this.__sleep(50);
                }
                         
                ((request_data,index) => {
                    that.request(request_data[0], request_data[1], request_data[2], request_data[3]).then((d)=>{
                 
                        that.emit('onRequestCompleted',d,request_data[3],index); 
                        this.multi_running--;         
                        this.multi_completed++;
                    }).catch((e)=>{
                        that.emit('onRequestError',e,request_data[3],index); 
                        this.multi_running--;
                        this.multi_completed++;
                    });
                })(this.multi_requests[k], k);
                this.multi_running ++;

            }    
        }catch(err) {
            console.log(err);
        };
    }

  
}


class Result {

    /**

     * Constructor for result from server object
     * 
     * @constructor
     */
    constructor(){
        this.http_code = 0;
        this.content_type = "";
        this.url = '';
        /*REquest data*/
        this.response_headers=[];

        this.body;
    }

    /**
     * Convert data downloaded from API to json
     * 
     * @return {object}
     */
    json(){
        if(this.content_type.indexOf('application/json') != -1){
            return this.body;
        }else{
            throw new Error("This is not json object");
        }
    }

    _getExtension(filename) {
        var i = filename.lastIndexOf('.');
        return (i < 0) ? '' : filename.substr(i);
    }
    /**
     * Save download data to file. If you dont add ext. Function will detect automatic file extension.
     * 
     * @param {string} file_path file path example: /tmp/document.pdf or /tmp/data.json or /tmp/image.jpg
     */
    async save(file_path){
        //check that file has ext
        var ext = this._getExtension(file_path);

        if(!ext){
             //check that file has ext
            if(this.content_type.indexOf('application/json')!=-1){
                ext = 'json';
            }else if(this.content_type.indexOf('application/pdf')!=-1){
                ext = 'pdf';
            }else if(this.content_type.indexOf('image/png')!=-1){
                ext = 'png';
            }else if(this.content_type.indexOf('image/jpg')!=-1){
                ext = 'jpg';
            }
            

            if(ext){
                file_path += '.' + ext;
            }
        }

        var that = this;
        return new Promise((resolve,reject)=>{
            try{
                if(that.content_type=='application/json'){
                    fs.writeFileSync(file_path, JSON.stringify(that.body));
                }else{
                    fs.writeFileSync(file_path, that.body);
                }

                
                resolve(true);
            }catch(e){
                reject(e);
            }
        });
    }
}

/**
 * @event onRequestCompleted
 * @description Event fired when request in method exec received completed data. Used in multi concurrent requests mode"
 * @param {object} return_data - object returned from server
 * @param {object} request_data - parameters send to server
 * @param {integer} request_index - index of request in queue 
 */
const onRequestCompleted = async(return_data, request_data, request_index) => {

}

/**
 * @event onRequestError
 * @description Event fired when request in method exec received error
 * @param {object} error_data - object with error returned from server
 * @param {object} request_data - parameters send to server
 * @param {integer} request_index - index of request in queue 
 */
const onRequestError = async(error_data, request_data, request_index) => {

}


module.exports = Webshotapi;