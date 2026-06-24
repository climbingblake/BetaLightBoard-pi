#include <Adafruit_NeoPixel.h>
#include <ArduinoOTA.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#ifndef STASSID
#define STASSID "Farmhouse"
#define STAPSK  "propersoul514"
#endif
const char* ssid = STASSID;
const char* password = STAPSK;
WiFiServer server(80);
const int MAX_PARAM = 10;
const unsigned int MAX_INPUT = 100;

// Routine state tracking
enum RoutineType { NONE, RAINBOW, CHASE, ICEFLAKES };
RoutineType currentRoutine = NONE;
unsigned long lastUpdate = 0;
uint16_t routineStep = 0;
int pixel[250];

#ifdef __AVR__
  #include <avr/power.h>
#endif

#define PIN 2

Adafruit_NeoPixel strip = Adafruit_NeoPixel(250, PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(115200);
  Serial.println("Booting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.waitForConnectResult() != WL_CONNECTED) {
    Serial.println("Connection Failed! Rebooting...");
    delay(5000);
    ESP.restart();
  }
  Serial.println("done Booting");
  ArduinoOTA.setHostname("lightboard");
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });
  ArduinoOTA.begin();
  Serial.println("Ready");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  server.begin();

  strip.begin();
  strip.setBrightness(42);
  strip.show(); 
  turnAllOff();
}

void turnAllOff(){
  for (uint16_t j=0; j < strip.numPixels(); j++) {
    strip.setPixelColor(j, 0,0,0);    
  }
  strip.show();
  currentRoutine = NONE;
}

uint32_t Wheel(byte WheelPos) {
  WheelPos = 255 - WheelPos;
  if(WheelPos < 85) {
    return strip.Color(255 - WheelPos * 3, 0, WheelPos * 3);
  }
  if(WheelPos < 170) {
    WheelPos -= 85;
    return strip.Color(0, WheelPos * 3, 255 - WheelPos * 3);
  }
  WheelPos -= 170;
  return strip.Color(WheelPos * 3, 255 - WheelPos * 3, 0);
}
 
void updateRainbow() {
  if(millis() - lastUpdate < 20) return;
  lastUpdate = millis();
  
  for(uint16_t i=0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, Wheel(((i * 256 / strip.numPixels()) + routineStep) & 255));
  }
  strip.show();
  routineStep++;
  if(routineStep >= 256) routineStep = 0;
}

void updateChase() {
  if(millis() - lastUpdate < 200) return;
  lastUpdate = millis();
  
  static int cycleCount = 0;
  static int q = 0;
  
  for (uint16_t i=0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i+q, 255,255,255);
  }
  for (uint16_t i=0; i < strip.numPixels(); i=i+3) {
    strip.setPixelColor(i+q, 255,0,0);
  }
  strip.show();
  
  for (uint16_t i=0; i < strip.numPixels(); i=i+3) {
    strip.setPixelColor(i+q, 0);
  }
  
  q++;
  if(q >= 3) {
    q = 0;
    cycleCount++;
    if(cycleCount >= 10) cycleCount = 0;
  }
}

void updateIceflakes() {
  if(millis() - lastUpdate < 200) return;
  lastUpdate = millis();
  
  if(routineStep == 0) {
    for(int p=0; p<250; p++){
      pixel[p] = random(0,255); 
    }
  }
  
  if((routineStep%5)==0){
    strip.setPixelColor(random(0,250), 0,0,255);
  }

  for(int p=0; p<250; p++){
    strip.setPixelColor(p, 0,0,pixel[p]);
    pixel[p] = pixel[p] - 10;
  }
  strip.show();
  
  routineStep++;
  if(routineStep >= 200) routineStep = 0;
}


void us_flag(){
  uint32_t red = strip.Color(255, 255, 255);
  uint32_t white = strip.Color(0, 255, 0);
  uint32_t blue = strip.Color(0, 0, 255);
  float blues[] = {0,1,2,3,16,17,18,19,20,21,22,23,36,37,38,39};
  
  for(int p=0; p<100 ; p++){
    strip.setPixelColor(p, ((p/10 % 2 == 0) ? white : red));           
  }

  for(int p=0; p < sizeof(blues) ; p++){
    strip.setPixelColor(blues[p], blue); 
  }
  
  strip.show();
}

void processGet (const char * data){
  const char * actionPos = strchr (data, '/');
  if (actionPos == NULL)
    return;

  const char * keyPos = strchr (actionPos, '?');
  if (keyPos == NULL)
    return;

  const char * valuePos = strchr (keyPos, '=');
  if (valuePos == NULL)
    return;

  const char * spacePos = strchr (valuePos, ' ');
  if (spacePos == NULL)
    return;
  
  int actionLength = keyPos - actionPos -1;
  int keyLength = valuePos - keyPos -1;
  int valueLength = spacePos - valuePos - 1;

  if (keyLength >= MAX_PARAM)
    return;
  
  char action [MAX_PARAM];
  char key [MAX_PARAM];
  char value [MAX_PARAM];
  
  int led_pos;

  memcpy (action, actionPos + 1, actionLength);
  memcpy (key, keyPos + 1, keyLength);
  memcpy (value, valuePos + 1, valueLength);

  action [actionLength] = 0;
  key [keyLength] = 0;
  value [valueLength] = 0;

  Serial.println(data);
  Serial.println("-----------------------------------------------------------");
  Serial.println(action);
  Serial.println(key);
  Serial.println(value);
  Serial.println("-----------------------------------------------------------");

  if (strcmp (action, "led") == 0){    
    int led_pos = atoi(key);    
    if(strcmp (value, "white") == 0){      
      strip.setPixelColor(led_pos, strip.Color(255, 255, 255));    
    }else if(strcmp (value, "green") == 0){      
      strip.setPixelColor(led_pos, strip.Color(255, 0, 0));  
    }else if(strcmp (value, "red") == 0){
      strip.setPixelColor(led_pos, strip.Color(0, 255, 0));  
    }else if(strcmp (value, "blue") == 0){
      strip.setPixelColor(led_pos, strip.Color(0, 0, 255));  
    }else if(strcmp (value, "lightblue") == 0){
      strip.setPixelColor(led_pos, strip.Color(255, 0, 255));  
    }else if(strcmp (value, "orange") == 0){
      strip.setPixelColor(led_pos, strip.Color(255, 255, 0));  
    }else if(strcmp (value, "purple") == 0){
      strip.setPixelColor(led_pos, strip.Color(0, 255, 255));  
    }else{
      strip.setPixelColor(led_pos, 0,0,0);  
      Serial.println("-----------------------------------------------------------off");
    }
  }else if (strcmp (action, "routine") == 0 ){
    if(strcmp (key, "stop") == 0 ){
      Serial.println("-----------------------------------------------------------stopping");
      turnAllOff();
    }else if(strcmp (key, "rainbow") == 0 ){
      Serial.println("-----------------------------------------------------------rainbow");
      currentRoutine = RAINBOW;
      routineStep = 0;
    }else if(strcmp (key, "chase") == 0 ){           
      Serial.println("-----------------------------------------------------------candy");
      currentRoutine = CHASE;
      routineStep = 0;
    }else if(strcmp (key, "us_flag") == 0 ){           
      Serial.println("-----------------------------------------------------------flag");
      currentRoutine = NONE;
      us_flag();    
    }else if(strcmp (key, "iceflakes") == 0 ){           
      Serial.println("-----------------------------------------------------------iceflakes");
      currentRoutine = ICEFLAKES;
      routineStep = 0;
    }else if(strcmp (key, "turn_off") == 0 ){
      Serial.println("-----------------------------------------------------------turn off");
      turnAllOff();  
    }
  }else if (strcmp (action, "brightness") == 0 ){
    if(strcmp (key, "level") == 0 ){
      int brightness = atoi(value);
      strip.setBrightness(brightness);
      strip.show();
      Serial.print("Brightness set to: ");
      Serial.println(brightness);
    }
  }
  strip.show();
}

void processData (const char * data){
  Serial.println (data);
  if (strlen (data) < 4)
    return;

  if (memcmp (data, "GET ", 4) == 0)
    processGet (&data [4]);
}

bool processIncomingByte (const byte inByte){
  static char input_line [MAX_INPUT];
  static unsigned int input_pos = 0;
  switch (inByte)
    {
    case '\n':
      input_line [input_pos] = 0;
      if (input_pos == 0)
        return true;
      processData (input_line);
      input_pos = 0;  
      break;

    case '\r':
      break;

    default:
      if (input_pos < (MAX_INPUT - 1))
        input_line [input_pos++] = inByte;
      break;
    }
  return false;
}

void loop() {
  ArduinoOTA.handle();
  
  // Run active routine
  switch(currentRoutine) {
    case RAINBOW:
      updateRainbow();
      break;
    case CHASE:
      updateChase();
      break;
    case ICEFLAKES:
      updateIceflakes();
      break;
    case NONE:
      break;
  }

  // Handle web requests
  WiFiClient client = server.available();
  if (client){
    Serial.println(F("Client connected"));
    boolean done = false;
    while (client.connected() && !done) 
      {
      while (client.available () > 0 && !done)
        done = processIncomingByte (client.read ());
      }

    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: text/html"));
    client.println(F("Connection: close"));
    client.println();
    client.println(F("<!DOCTYPE HTML>"));
    client.println(F("<html>"));
    client.println(F("<head>"));
    client.println(F("<title>LED Matrix</title>"));
    client.println("<style>html { font-family: Helvetica; display: inline-block; margin: 0px auto; text-align: center;}");
    client.println(".button { background-color: #195B6A; border: none; color: white; padding: 16px 40px;");
    client.println("text-decoration: none; font-size: 30px; margin: 2px; cursor: pointer;}");
    client.println(".button2 {background-color: #77878A;}</style></head>");
    
    client.println(F("</head>"));
    client.println(F("<body>"));
    client.println(F("<h1>LED Matrix</h1>"));
    client.println(F("<hr>"));
    client.println(F("<a href='/routine?rainbow=1'>Rainbow</a><br>"));
    client.println(F("<a href='/routine?chase=1'>Candy Chase</a><br>"));    
    client.println(F("<a href='/routine?us_flag=1'>US Flag</a><br>"));
    client.println(F("<a href='/routine?iceflakes=1'>Iceflakes</a><br>"));
    client.println(F("<form action='/brightness' method='get'>"));
    client.println(F("Brightness: <input type='range' name='level' min='10' max='255' value='42'>"));
    client.println(F("<input type='submit' value='Set'>"));
    client.println(F("</form>"));
    client.println(F("<hr><br>"));
    client.println(F("<div><a href='/routine?stop=1' class='button button2'>Stop Routine</a></div><br>"));
    client.println(F("<div><a href='/routine?turn_off=1' class='button'>All Off</a></div>"));
    client.println(F("</body>"));
    client.println(F("</html>"));
   }
}