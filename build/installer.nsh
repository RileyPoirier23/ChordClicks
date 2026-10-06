; Extra branding for the ChordClicks installer (electron-builder NSIS include).
; Only uses documented electron-builder hooks: customHeader and customWelcomePage.

!macro customHeader
  BrandingText "ChordClicks - Created by Riley Mackay-Poirier @506clicks"
!macroend

!macro customWelcomePage
  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Welcome to ChordClicks"
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "Practice songs, learn scales and follow solos with your chords and fretboard burned into your camera feed.$\r$\n$\r$\nCreated by Riley Mackay-Poirier @506clicks.$\r$\n$\r$\nThis wizard installs ChordClicks for your Windows account. No admin rights are needed.$\r$\n$\r$\nClick Next to continue."
  !endif
  !insertmacro MUI_PAGE_WELCOME
!macroend
