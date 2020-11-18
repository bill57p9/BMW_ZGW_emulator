# BMW CAN Bus Gateway & Proxy
## Introduction
This project offers the ability to work with CAN bus BMW/Mini ECUs in the absence of the CAN bus they expect to be found on.

There are 2 components:
* ### CAN Gateway
An Arduino with 1 or 2 CAN bus shields and performs two distinct functions:
 * Provides a gateway between the connected CAN bus and the ZGW proxy via the Arduino USB connection. This is only used during diagnostics/coding/programming e.g. using ISTA or E-Sys
 * Forwards selected CAN messages (by ID) from one CAN bus to another if 2 CAN shields are fitted
* ### ZGW Proxy
Provides a proxied ENET connection

The PC diagnostics/coding/programming tools connect to the proxy instead of the car. The proxy then routes the messages to the actual car ENET connection and, if destined for the configured target ECU, onto the CAN bus via the USB connection to the CAN gateway component. Messages from the target ECU destined for the diagnostics/coding/programming tools are read directly from the CAN bus by the CAN Gateway, sent to the Proxy via the USB connection which sends them to the diagnostics/coding/programming tool.

## Background
I fitted the retrofit reversing camera (ICAM) to my BMW F46, which uses the F56 platform, only to discover that my car central gateway (ZGW) couldn't support the KCAN3 bus required for the ICAM.

Other older BMW platforms support the ICAM on KCAN2 however this doesn't work on F56.

After a lot of reverse engineering I identified which CAN buses needed which CAN bus messages to allow the ICAM to function. Specifically placing ICAM on KCAN4 and forwarding 0x37A messages to KCAN2.

I also reverse engineered the ENET protocol between the PC based software for diagnostics, coding & programming (ISTA & E-Sys).

## Compatibility
Whilst this project can support other platforms and could be adapted for other ECUs,
out of the box it supports ICAM (camera) on the BMW/Mini F56 platform. Note that this has so far only been testing on a vehicle with PDC/PMA.

The following vehicles use the F56 platform and therefore _should_ work:
* BMW 1 series F40 & F52
* BMW 2 series F44, Active Tourer F45, Grand Tourer F46
* BMW X1 F48
* BMW X2 F39
* Mini Clubman F54
* Mini Hatch F55 & F56
* Mini Convertible F57
* Mini Clubman F60

## ICAM (Reversing Camera Retrofit)
At the high level, the following steps need to be performed:
1. Fit the ICAM connecting it to KCAN4
2. Build, program & fit the CAN Gateway - See README on the CAN_gateway_arduino directory
3. Install & run the ZGW Proxy - See README in the ZGW_proxy_nodejs folder
4. Turn car ignition ON
5. Using E-Sys, VO code the car PDC/PMA and HU to add 3AG
6. Using E-Sys default code your ICAM
7. Turn car ignition OFF
8. Disconnect PC from car (network wise & physical USB)
