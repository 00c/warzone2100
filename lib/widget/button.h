/*
	This file is part of Warzone 2100.
	Copyright (C) 1999-2004  Eidos Interactive
	Copyright (C) 2005-2013  Warzone 2100 Project

	Warzone 2100 is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	Warzone 2100 is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with Warzone 2100; if not, write to the Free Software
	Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
*/
/** @file
 *  Definitions for edit box functions.
 */

#ifndef __INCLUDED_LIB_WIDGET_BUTTON_H__
#define __INCLUDED_LIB_WIDGET_BUTTON_H__

#include "widget.h"
#include "widgbase.h"
#include "lib/ivis_opengl/textdraw.h"

/* Button states */
enum
{
	WBUT_DOWN      = 0x10,  ///< Button is down.
	WBUT_HIGHLIGHT = 0x20,  ///< Button is highlighted.
};

struct W_BUTTON : public WIDGET
{
	W_BUTTON(W_BUTINIT const *init);

	void clicked(W_CONTEXT *psContext, WIDGET_KEY key);
	void released(W_CONTEXT *psContext, WIDGET_KEY key);
	void highlight(W_CONTEXT *psContext);
	void highlightLost();
	void display(int xOffset, int yOffset, PIELIGHT *pColours);

	unsigned getState();
	void setState(unsigned state);
	void setFlash(bool enable);
	QString getString() const;
	void setString(QString string);
	void setTip(QString string);

	UDWORD		state;				// The current button state
	QString         pText;                          // The text for the button
	QString         pTip;                           // The tool tip for the button
	SWORD HilightAudioID;				// Audio ID for form clicked sound
	SWORD ClickedAudioID;				// Audio ID for form hilighted sound
	WIDGET_AUDIOCALLBACK AudioCallback;	// Pointer to audio callback function
	iV_fonts        FontID;
};

#endif // __INCLUDED_LIB_WIDGET_BUTTON_H__
