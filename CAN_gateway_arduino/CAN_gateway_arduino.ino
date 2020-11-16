// MCP2515 CAN module
#include <mcp2515.h>

#define NONE -1

// CAN bus configuration
const CAN_CLOCK MCP_OSC       = MCP_8MHZ;
const CAN_SPEED KCAN_DATA_RATE= CAN_500KBPS;

// CAN ID configuration
// Up to 4 IDs can be forwarded
// Dummy values for unused filters must be different
const uint32_t CAN_ID_FWD1    = 0x37A;
const uint32_t CAN_ID_FWD2    = 0xFF2; // Dummy impossible value
const uint32_t CAN_ID_FWD3    = 0xFF3; // Dummy impossible value
const uint32_t CAN_ID_FWD4    = 0xFF4; // Dummy impossible value
const uint32_t CAN_MASK_FWD   = 0x7FF; // Unique ID
const uint32_t CAN_ID_DIAG1   = 0x606; // Diag messages from ICAM
const uint32_t CAN_ID_DIAG2   = 0xFF2; // Dummy impossible value
const uint32_t CAN_MASK_DIAG  = 0x7FF; // Unique ID

// CAN module hardware configuration
const int KCAN2_CS_PIN  = 9;
const int KCAN4_CS_PIN  = 10;

const int SERIAL_BUF_SIZE= 32;
const char HEX_ERROR     = 0xFF;

struct can_frame message;
char   serialRxBuf[SERIAL_BUF_SIZE];
size_t serialRxLen;
bool   error;

MCP2515 kcan2(KCAN2_CS_PIN);
MCP2515 kcan4(KCAN4_CS_PIN);

void setup()
{
  Serial.begin(1000000);

  serialRxLen = 0;
  
  // Set up KCAN data buses
  kcan2.reset();
  kcan2.setConfigMode();
  kcan2.setBitrate(KCAN_DATA_RATE, MCP_OSC);
  kcan2.setNormalMode();

  kcan4.reset();
  kcan4.setConfigMode();
  kcan4.setBitrate(KCAN_DATA_RATE, MCP_OSC);

  // Set KCAN4 RXB0 filter so we only receive diagnostics messages
  kcan4.setFilterMask(MCP2515::MASK0, false, CAN_MASK_DIAG);
  kcan4.setFilter(MCP2515::RXF0, false, CAN_ID_DIAG1);
  kcan4.setFilter(MCP2515::RXF1, false, CAN_ID_DIAG2);
  // Set KCAN4 RXB1 filter so we only receive the messages we need to forward
  kcan4.setFilterMask(MCP2515::MASK1, false, CAN_MASK_FWD);
  kcan4.setFilter(MCP2515::RXF2, false, CAN_ID_FWD1);
  kcan4.setFilter(MCP2515::RXF3, false, CAN_ID_FWD2);
  kcan4.setFilter(MCP2515::RXF4, false, CAN_ID_FWD3);
  kcan4.setFilter(MCP2515::RXF5, false, CAN_ID_FWD4);
  
  kcan4.setNormalMode();

  while(!Serial) {}; // Wait for serial port to initialise
  Serial.println();

}

void loop()
{
  // Check KCAN4
  switch(kcan4.readMessage(&message))
  {
    case MCP2515::ERROR_OK:
      printCANmessage();
      switch(message.can_id)
      {
        // Messages to forward to KCAN2
        case CAN_ID_FWD1:
        case CAN_ID_FWD2:
        case CAN_ID_FWD3:
        case CAN_ID_FWD4:
          Serial.print(" ->KCAN2 ");
          Serial.print(kcan2.sendMessage(&message));  // Note one shot

          break;
      }
      Serial.println(); // End line
      
      break;
  }

  // Poll Serial input
  if(Serial.available())
  {
    serialRxBuf[serialRxLen] = Serial.read();

    ++serialRxLen;
    
    // Check for terminator
    if('\n' == serialRxBuf[serialRxLen-1])
    {
      // Terminator received - Have full message
      error = false;

      // Check message is credible (nnn#nn etc)
      if('#' == serialRxBuf[3] && serialRxLen > 5 && (serialRxLen & 1))
      {
        // Get length
        message.can_dlc = (serialRxLen - 5) >> 1;
        
        // Read ID
        int raw = hexToBin(&serialRxBuf[0],3);
        if(raw > -1)
        {
          message.can_id = raw;
          // Now decipher data
          for(int x=0; x<message.can_dlc; ++x)
          {
            raw = hexToBin(&serialRxBuf[4+(2*x)],2);
            if(raw > -1)
              message.data[x] = (char) raw;
          }
          if(!error)
          {
            MCP2515::ERROR txResult;
            printCANmessage();
            Serial.print(" -> KCAN4");
            do
            {
              txResult = kcan4.sendMessage(&message);
              Serial.print(" ");
              Serial.print(txResult);
            } while(MCP2515::ERROR_OK != txResult);
            Serial.println();
            
          }
       }
      }
      else
        Serial.println("! CAN message length/format not credible");

      serialRxLen = 0;
    }
    else if(serialRxLen > 20)
    {
      // Payload > 8 bytes
      Serial.println("! Message too long for CAN");
      serialRxLen = 0;
    }
  }  

}

void printCANmessage()
{
      if(message.can_id < 0x100)
        Serial.print("0");
      if(message.can_id < 0x10)
        Serial.print("0");
      Serial.print(message.can_id, HEX); // print ID
      Serial.print("#"); 
      
      for (int i = 0; i<message.can_dlc; i++)
      {  // print the data
        if(message.data[i] < 0x10)
          Serial.print("0");
        Serial.print(message.data[i],HEX);
      }  
}

int  hexToBin(char* data, size_t nibbles)
{
  int result = 0;
  for(int x=0; x<nibbles; ++x)
  {
    char nibble = hexToNibble(data[x]);
    if(HEX_ERROR == nibble)
    {
      Serial.println("! Message not hex");
      error = true;
      return -1;
    }
    else
      result += nibble << (4 * (nibbles-x-1));
  }
  return result;
}
char hexToNibble(char data)
{
  if(data < '0')  return HEX_ERROR;
  if(data <='9')  return data-'0';
  if(data < 'A')  return HEX_ERROR;
  if(data <='F')  return data-('A'-10);
  if(data < 'A')  return HEX_ERROR;
  if(data <='F')  return data-('A'-10);
  if(data < 'a')  return HEX_ERROR;
  if(data <='f')  return data-('a'-10);

  return HEX_ERROR;
}
