# JPDB Media Importer Chrome Extension

## Overview
This extension designed for **JPDB** users who want to enhance their learning experience by integrating custom images, audio, and sentences into the JPDB platform.
This extension enables users to fetch media from existing **Anki** decks and displays them during reviews.  You can create custom Anki cards with Images and audio using tools like **[asbplayer](https://github.com/killergerbah/asbplayer)** or **[subs2srs](https://subs2srs.sourceforge.net/)**, then sync the media from those decks to use within JPDB using this extension.

 
## Review Page
![image](https://github.com/user-attachments/assets/59a3bb4b-3056-4379-9f46-974e79fefdab)

## Vocabulary Page
![image](https://github.com/user-attachments/assets/a4a3941d-55f0-4c46-9219-c22ec486c334)

## Demo
https://github.com/user-attachments/assets/015ffdb5-ca37-458b-8345-2e13f8a0863a



## Features
- Seamless integration of **images, audio, and sentence media** from Anki into JPDB.
- Automatic filtering and categorizing of media **based on the vocabulary present in the sentence**.
- With this extension, media is automatically injected into **JPDB vocabulary and review pages**.

## Requirements
To start using this extension, make sure you have the following:

- **JPDB API Key** Required for interacting with JPDB (Don't use the same API key shown in the Video, use the one available at the bottom of the JPDB settings page!).
- **Anki** (Installed on your computer).
- **Anki Connect Addon** (Installed in Anki).
- **Anki Deck** (Containing the media files you want to sync with JPDB).
- **Chrome Browser** (any browser which supports Chrome extensions).

## Webstore Installation
- Visit the following link and add to the browser **[JPDB Media Support](https://chromewebstore.google.com/detail/jpdb-media-support/pdhlakhlcgpogjkfaaidlnpogenbekif)**

## Manual Installation
- Download the code as a `.zip` file Directly or from Releases Page.
- Extract the zip file in a location of your choosing.
- Open up your browser and navigate to `chrome://extensions/`.
- Check the `Developer mode` switch at the top right of your window.
- Click the `Load unpacked` button at the top left.
- In the file picker dialog, navigate to the folder where you extracted earlier. You should see a file called manifest.json inside the folder.
- Click select/open/choose to exit the dialog and load the extension.

## Setup
### 1. Install Anki & Anki Connect
- Download and install **[Anki](https://apps.ankiweb.net/)**.
- Install the **[Anki Connect Addon](https://ankiweb.net/shared/info/2055492159)** from AnkiWeb.

### 2. Configure the Extension
- Enter your **JPDB API Key** (which is crucial for categorizing media base on JPDB's VID).
- Set the **Anki Connect URL** (default: `http://localhost:8765`).
- Choose the **Anki Deck** which contains the cards to fetch media from.
- In the **Japanese Sentence Field** choose the field which contains the japanese sentence and in the **Translated Sentence Field** choose the field which contains English / any other explanation sentence. 
- Enable/disable **Auto Play Audio** and **Hide Native Sentence** as needed.
- Hit **Sync Data with Anki** to fetch all the data from the anki cards.
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
- Make sure that the **each card's context field has some valid vocabulary**.


## Contribution
Feel free to contribute to this project by submitting issues or pull requests. If you have feature suggestions or bug reports, please open an issue on GitHub.


Happy learning with **JPDB Media Support**! 🎉

