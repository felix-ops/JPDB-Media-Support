# JPDB Media Importer Chrome Extension

## Overview
JPDB Media Importer is a Chrome extension designed for **JPDB** users who want to enhance their learning experience by integrating custom media (images, audio, and sentences) into the JPDB site. This extension enables users to pull media from **Anki** using the **Anki Connect API**.  the user can create custom Anki decks using tools like **asbplayer** or **subs2srs**, and use the created deck as a media for JPDB site.


## Review Page
![image](https://github.com/user-attachments/assets/59a3bb4b-3056-4379-9f46-974e79fefdab)

## Vocabulary Page
![image](https://github.com/user-attachments/assets/a4a3941d-55f0-4c46-9219-c22ec486c334)



## Features
- Seamless integration of **images, audio, and sentence media** from Anki into JPDB.
- Automatic filtering and categorizing of media **based on the vocabulary present in the sentence**.
- With this extension, media is automatically injected into **JPDB vocabulary and review pages**.

## Requirements
To start using this extension, make sure you have the following:

1. **JPDB API Key** (Required for interacting with JPDB)
2. **Anki** (Installed on your computer)
3. **Anki Connect Addon** (Installed in Anki)
4. **Anki Deck** (Containing the media files you want to integrate with JPDB)
5. **Chrome Browser** (any browser which supports Chrome extensions)

## Installation & Setup
### 1. Install Anki & Anki Connect
- Download and install **[Anki](https://apps.ankiweb.net/)**.
- Install the **[Anki Connect Addon](https://ankiweb.net/shared/info/2055492159)** from AnkiWeb.
- create the deck 

### 2. Configure the Extension
- Enter your **JPDB API Key** (which is crucial for categorizing media base on VID).
- Set the **Anki Connect URL** (default: `http://localhost:8765`).
- Choose the **Anki Deck** which contains the cards to fetch media from.
- In the **Context Field** choose the field that contains the sentences. (It can contain both the Japanese and Translated sentences together, the extension will handle the separation) 
- Enable/disable **Auto Play Audio** and **Hide Native Sentence** as needed.
- Hit **Sync Data with Anki** to fetch all the data from the anki cards
- Click **Save Config** to store your settings.

## How It Works
1. The extension fetches vocabulary from the **JPDB page** the user is currently on.
2. It then checks **Anki** (via Anki Connect) to see if there are any media files associated with that vocabulary.
3. If media files exist, they are **automatically injected** into JPDB’s **Vocabulary** and **Review** pages.

## Troubleshooting
### 1. Media is not appearing on JPDB
- Ensure that **Anki is running** in the background.
- Check if **Anki Connect is installed** and responding at `http://localhost:8765`.
- Verify that the **deck and field names** in the extension match those in Anki.
- Make sure that the **each card's context field has some valid vocabulary text**.


## Contribution
Feel free to contribute to this project by submitting issues or pull requests. If you have feature suggestions or bug reports, please open an issue on GitHub.


Happy learning with **JPDB Media Support**! 🎉

