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
 *  The main interface functions to the widget library
 */

#include "lib/framework/frame.h"
#include "lib/framework/string_ext.h"
#include "lib/framework/frameint.h"
#include "lib/framework/utf.h"
#include "lib/ivis_opengl/textdraw.h"

#include "widget.h"
#include "widgint.h"

#include "form.h"
#include "label.h"
#include "button.h"
#include "editbox.h"
#include "bar.h"
#include "slider.h"
#include "tip.h"

static	bool	bWidgetsActive = true;

/* The widget the mouse is over this update */
static WIDGET	*psMouseOverWidget = NULL;

static WIDGET_AUDIOCALLBACK AudioCallback = NULL;
static SWORD HilightAudioID = -1;
static SWORD ClickedAudioID = -1;

/* Function prototypes */
static void widgDisplayForm(W_FORM *psForm, UDWORD xOffset, UDWORD yOffset);

static WIDGET_KEY lastReleasedKey_DEPRECATED = WKEY_NONE;


/* Initialise the widget module */
bool widgInitialise()
{
	tipInitialise();

	return true;
}


// Reset the widgets.
//
void widgReset(void)
{
	tipInitialise();
}


/* Shut down the widget module */
void widgShutDown(void)
{
}


W_INIT::W_INIT()
	: formID(0)
	, majorID(0)
	, id(0)
	, style(0)
	, x(0), y(0)
	, width(0), height(0)
	, pDisplay(NULL)
	, pCallback(NULL)
	, pUserData(NULL)
	, UserData(0)
{}

WIDGET::WIDGET(W_INIT const *init, WIDGET_TYPE type)
	: formID(init->formID)
	, id(init->id)
	, type(type)
	, style(init->style)
	, x(init->x), y(init->y)
	, width(init->width), height(init->height)
	, displayFunction(init->pDisplay)
	, callback(init->pCallback)
	, pUserData(init->pUserData)
	, UserData(init->UserData)
	, parentWidget(NULL)
{}

WIDGET::WIDGET(WIDGET *parent)
	: formID(0)
	, id(0xFFFFEEEEu)
	, type(WIDG_UNSPECIFIED_TYPE)
	, style(0)
	, x(0), y(0)
	, width(1), height(1)
	, displayFunction(NULL)
	, callback(NULL)
	, pUserData(NULL)
	, UserData(0)
	, parentWidget(NULL)
{
	parent->attach(this);
}

WIDGET::~WIDGET()
{
	if (psMouseOverWidget == this)
	{
		psMouseOverWidget = NULL;
	}
	if (screenPointer != NULL && screenPointer->psFocus == this)
	{
		screenPointer->psFocus = NULL;
	}

	if (parentWidget != NULL)
	{
		parentWidget->detach(this);
	}
	for (unsigned n = 0; n < childWidgets.size(); ++n)
	{
		childWidgets[n]->parentWidget = NULL;  // Detach in advance, slightly faster than detach(), and doesn't change our list.
		delete childWidgets[n];
	}
}

void WIDGET::attach(WIDGET *widget)
{
	ASSERT_OR_RETURN(, widget != NULL && widget->parentWidget == NULL, "Bad attach.");
	widget->parentWidget = this;
	widget->setScreenPointer(screenPointer);
	childWidgets.push_back(widget);
}

void WIDGET::detach(WIDGET *widget)
{
	ASSERT_OR_RETURN(, widget != NULL && widget->parentWidget != NULL, "Bad detach.");

	widget->parentWidget = NULL;
	widget->setScreenPointer(NULL);
	childWidgets.erase(std::find(childWidgets.begin(), childWidgets.end(), widget));

	widgetLost(widget);
}

void WIDGET::setScreenPointer(W_SCREEN *screen)
{
	screenPointer = screen;
	for (Children::const_iterator i = childWidgets.begin(); i != childWidgets.end(); ++i)
	{
		(*i)->setScreenPointer(screen);
	}
}

void WIDGET::widgetLost(WIDGET *widget)
{
	if (parentWidget != NULL)
	{
		parentWidget->widgetLost(widget);  // We don't care about the lost widget, maybe the parent does. (Special code for W_TABFORM.)
	}
}

W_SCREEN::W_SCREEN()
	: psFocus(NULL)
	, TipFontID(font_regular)
{
	W_FORMINIT sInit;
	sInit.id = 0;
	sInit.style = WFORM_PLAIN | WFORM_INVISIBLE;
	sInit.x = 0;
	sInit.y = 0;
	sInit.width = screenWidth - 1;
	sInit.height = screenHeight - 1;

	psForm = new W_FORM(&sInit);
	psForm->screenPointer = this;
}

W_SCREEN::~W_SCREEN()
{
	delete psForm;
}

/* Check whether an ID has been used on a form */
static bool widgCheckIDForm(W_FORM *psForm, UDWORD id)
{
	WIDGET			*psCurr;
	W_FORMGETALL	sGetAll;

	/* Check the widgets on the form */
	formInitGetAllWidgets(psForm, &sGetAll);
	psCurr = formGetAllWidgets(&sGetAll);
	while (psCurr != NULL)
	{
		if (psCurr->id == id)
		{
			return true;
		}

		if (psCurr->type == WIDG_FORM)
		{
			/* Another form so recurse */
			if (widgCheckIDForm((W_FORM *)psCurr, id))
			{
				return true;
			}
		}

		psCurr = formGetAllWidgets(&sGetAll);
	}

	return false;
}

static bool widgAddWidget(W_SCREEN *psScreen, W_INIT const *psInit, WIDGET *widget)
{
	ASSERT_OR_RETURN(false, widget != NULL, "Invalid widget");
	ASSERT_OR_RETURN(false, psScreen != NULL, "Invalid screen pointer");
	ASSERT_OR_RETURN(false, !widgCheckIDForm((W_FORM *)psScreen->psForm, psInit->id), "ID number has already been used (%d)", psInit->id);
	// Find the form to add the widget to.
	W_FORM *psParent;
	if (psInit->formID == 0)
	{
		/* Add to the base form */
		psParent = psScreen->psForm;
	}
	else
	{
		psParent = (W_FORM *)widgGetFromID(psScreen, psInit->formID);
	}
	ASSERT_OR_RETURN(false, psParent != NULL && psParent->type == WIDG_FORM, "Could not find parent form from formID");

	bool added = formAddWidget(psParent, widget, psInit);
	return added;  // Should be true, unless triggering an assertion.
}

/* Add a form to the widget screen */
bool widgAddForm(W_SCREEN *psScreen, const W_FORMINIT *psInit)
{
	W_FORM *psForm;
	if (psInit->style & WFORM_TABBED)
	{
		psForm = new W_TABFORM(psInit);
	}
	else if (psInit->style & WFORM_CLICKABLE)
	{
		psForm = new W_CLICKFORM(psInit);
	}
	else
	{
		psForm = new W_FORM(psInit);
	}

	return widgAddWidget(psScreen, psInit, psForm);
}

/* Add a label to the widget screen */
bool widgAddLabel(W_SCREEN *psScreen, const W_LABINIT *psInit)
{
	W_LABEL *psLabel = new W_LABEL(psInit);
	return widgAddWidget(psScreen, psInit, psLabel);
}

/* Add a button to the widget screen */
bool widgAddButton(W_SCREEN *psScreen, const W_BUTINIT *psInit)
{
	W_BUTTON *psButton = new W_BUTTON(psInit);
	return widgAddWidget(psScreen, psInit, psButton);
}

/* Add an edit box to the widget screen */
bool widgAddEditBox(W_SCREEN *psScreen, const W_EDBINIT *psInit)
{
	W_EDITBOX *psEdBox = new W_EDITBOX(psInit);
	return widgAddWidget(psScreen, psInit, psEdBox);
}

/* Add a bar graph to the widget screen */
bool widgAddBarGraph(W_SCREEN *psScreen, const W_BARINIT *psInit)
{
	W_BARGRAPH *psBarGraph = new W_BARGRAPH(psInit);
	return widgAddWidget(psScreen, psInit, psBarGraph);
}

/* Add a slider to a form */
bool widgAddSlider(W_SCREEN *psScreen, const W_SLDINIT *psInit)
{
	W_SLIDER *psSlider = new W_SLIDER(psInit);
	return widgAddWidget(psScreen, psInit, psSlider);
}

/* Delete a widget from the screen */
void widgDelete(W_SCREEN *psScreen, UDWORD id)
{
	ASSERT_OR_RETURN(, psScreen != NULL, "Invalid screen pointer");

	delete widgGetFromID(psScreen, id);
}

/* Find a widget on a form from its id number */
static WIDGET *widgFormGetFromID(WIDGET *widget, UDWORD id)
{
	if (widget->id == id)
	{
		return widget;
	}
	WIDGET::Children const &c = widget->children();
	for (WIDGET::Children::const_iterator i = c.begin(); i != c.end(); ++i)
	{
		WIDGET *w = widgFormGetFromID(*i, id);
		if (w != NULL)
		{
			return w;
		}
	}
	return NULL;
}

/* Find a widget in a screen from its ID number */
WIDGET *widgGetFromID(W_SCREEN *psScreen, UDWORD id)
{
	ASSERT_OR_RETURN(NULL, psScreen != NULL, "Invalid screen pointer");
	return widgFormGetFromID(psScreen->psForm, id);
}

void widgHide(W_SCREEN *psScreen, UDWORD id)
{
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget != NULL, "Couldn't find widget from id.");

	psWidget->hide();
}

void widgReveal(W_SCREEN *psScreen, UDWORD id)
{
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget != NULL, "Couldn't find widget from id.");

	psWidget->show();
}


/* Get the current position of a widget */
void widgGetPos(W_SCREEN *psScreen, UDWORD id, SWORD *pX, SWORD *pY)
{
	WIDGET	*psWidget;

	/* Find the widget */
	psWidget = widgGetFromID(psScreen, id);
	if (psWidget != NULL)
	{
		*pX = psWidget->x;
		*pY = psWidget->y;
	}
	else
	{
		ASSERT(!"Couldn't find widget by ID", "Couldn't find widget by ID");
		*pX = 0;
		*pY = 0;
	}
}

/* Return the ID of the widget the mouse was over this frame */
UDWORD widgGetMouseOver(W_SCREEN *psScreen)
{
	/* Don't actually need the screen parameter at the moment - but it might be
	   handy if psMouseOverWidget needs to stop being a static and moves into
	   the screen structure */
	(void)psScreen;

	if (psMouseOverWidget == NULL)
	{
		return 0;
	}

	return psMouseOverWidget->id;
}


/* Return the user data for a widget */
void *widgGetUserData(W_SCREEN *psScreen, UDWORD id)
{
	WIDGET	*psWidget;

	psWidget = widgGetFromID(psScreen, id);
	if (psWidget)
	{
		return psWidget->pUserData;
	}

	return NULL;
}


/* Return the user data for a widget */
UDWORD widgGetUserData2(W_SCREEN *psScreen, UDWORD id)
{
	WIDGET	*psWidget;

	psWidget = widgGetFromID(psScreen, id);
	if (psWidget)
	{
		return psWidget->UserData;
	}

	return 0;
}


/* Set user data for a widget */
void widgSetUserData(W_SCREEN *psScreen, UDWORD id, void *UserData)
{
	WIDGET	*psWidget;

	psWidget = widgGetFromID(psScreen, id);
	if (psWidget)
	{
		psWidget->pUserData = UserData;
	}
}

/* Set user data for a widget */
void widgSetUserData2(W_SCREEN *psScreen, UDWORD id, UDWORD UserData)
{
	WIDGET	*psWidget;

	psWidget = widgGetFromID(psScreen, id);
	if (psWidget)
	{
		psWidget->UserData = UserData;
	}
}

void WIDGET::setTip(QString)
{
	ASSERT(false, "Can't set widget type %u's tip.", type);
}

/* Set tip string for a widget */
void widgSetTip(W_SCREEN *psScreen, UDWORD id, const char *pTip)
{
	WIDGET *psWidget = widgGetFromID(psScreen, id);

	if (!psWidget)
	{
		return;
	}

	psWidget->setTip(pTip);
}

/* Return which key was used to press the last returned widget */
UDWORD widgGetButtonKey_DEPRECATED(W_SCREEN *psScreen)
{
	/* Don't actually need the screen parameter at the moment - but it might be
	   handy if released needs to stop being a static and moves into
	   the screen structure */
	(void)psScreen;

	return lastReleasedKey_DEPRECATED;
}

unsigned WIDGET::getState()
{
	ASSERT(false, "Can't get widget type %u's state.", type);
	return 0;
}

/* Get a button or clickable form's state */
UDWORD widgGetButtonState(W_SCREEN *psScreen, UDWORD id)
{
	/* Get the button */
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(0, psWidget, "Couldn't find widget by ID %u", id);

	return psWidget->getState();
}

void WIDGET::setFlash(bool)
{
	ASSERT(false, "Can't set widget type %u's flash.", type);
}

void widgSetButtonFlash(W_SCREEN *psScreen, UDWORD id)
{
	/* Get the button */
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget, "Couldn't find widget by ID %u", id);

	psWidget->setFlash(true);
}

void widgClearButtonFlash(W_SCREEN *psScreen, UDWORD id)
{
	/* Get the button */
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget, "Couldn't find widget by ID %u", id);

	psWidget->setFlash(false);
}


void WIDGET::setState(unsigned)
{
	ASSERT(false, "Can't set widget type %u's state.", type);
}

/* Set a button or clickable form's state */
void widgSetButtonState(W_SCREEN *psScreen, UDWORD id, UDWORD state)
{
	/* Get the button */
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget, "Couldn't find widget by ID %u", id);

	psWidget->setState(state);
}

QString WIDGET::getString() const
{
	ASSERT(false, "Can't get widget type %u's string.", type);
	return QString();
}

/* Return a pointer to a buffer containing the current string of a widget.
 * NOTE: The string must be copied out of the buffer
 */
const char *widgGetString(W_SCREEN *psScreen, UDWORD id)
{
	const WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN("", psWidget, "Couldn't find widget by ID %u", id);

	static QByteArray ret;  // Must be static so it isn't immediately freed when this function returns.
	ret = psWidget->getString().toUtf8();
	return ret.constData();
}

void WIDGET::setString(QString)
{
	ASSERT(false, "Can't set widget type %u's string.", type);
}

/* Set the text in a widget */
void widgSetString(W_SCREEN *psScreen, UDWORD id, const char *pText)
{
	/* Get the widget */
	WIDGET *psWidget = widgGetFromID(psScreen, id);
	ASSERT_OR_RETURN(, psWidget, "Couldn't find widget by ID %u", id);

	if (psWidget->type == WIDG_EDITBOX && psScreen->psFocus == psWidget)
	{
		screenClearFocus(psScreen);
	}

	psWidget->setString(QString::fromUtf8(pText));
}


/* Call any callbacks for the widgets on a form */
static void widgProcessCallbacks(W_CONTEXT *psContext)
{
	WIDGET			*psCurr;
	W_CONTEXT		sFormContext, sWidgContext;
	SDWORD			xOrigin, yOrigin;
	W_FORMGETALL	sFormCtl;

	/* Initialise the form context */
	sFormContext.psScreen = psContext->psScreen;

	/* Initialise widget context */
	formGetOrigin(psContext->psForm, &xOrigin, &yOrigin);
	sWidgContext.psScreen = psContext->psScreen;
	sWidgContext.psForm = psContext->psForm;
	sWidgContext.mx = psContext->mx - xOrigin;
	sWidgContext.my = psContext->my - yOrigin;
	sWidgContext.xOffset = psContext->xOffset + xOrigin;
	sWidgContext.yOffset = psContext->yOffset + yOrigin;

	/* Go through all the widgets on the form */
	formInitGetAllWidgets(psContext->psForm, &sFormCtl);
	psCurr = formGetAllWidgets(&sFormCtl);
	while (psCurr)
	{
		/* Call the callback */
		if (psCurr->callback)
		{
			psCurr->callback(psCurr, &sWidgContext);
		}

		/* and then recurse */
		if (psCurr->type == WIDG_FORM)
		{
			sFormContext.psForm = (W_FORM *)psCurr;
			sFormContext.mx = sWidgContext.mx - psCurr->x;
			sFormContext.my = sWidgContext.my - psCurr->y;
			sFormContext.xOffset = sWidgContext.xOffset + psCurr->x;
			sFormContext.yOffset = sWidgContext.yOffset + psCurr->y;
			widgProcessCallbacks(&sFormContext);
		}

		/* See if the form has any more widgets on it */
		psCurr = formGetAllWidgets(&sFormCtl);
	}
}


/* Process all the widgets on a form.
 * mx and my are the coords of the mouse relative to the form origin.
 */
static void widgProcessForm(W_CONTEXT *psContext)
{
	SDWORD		mx, my, xOffset, yOffset, xOrigin, yOrigin;
	W_FORM		*psForm;
	W_CONTEXT	sFormContext, sWidgContext;

	/* Note current form */
	psForm = psContext->psForm;

	/* Note the current mouse position */
	mx = psContext->mx;
	my = psContext->my;

	/* Note the current offset */
	xOffset = psContext->xOffset;
	yOffset = psContext->yOffset;

	/* Initialise the form context */
	sFormContext.psScreen = psContext->psScreen;

	/* Initialise widget context */
	formGetOrigin(psForm, &xOrigin, &yOrigin);
	sWidgContext.psScreen = psContext->psScreen;
	sWidgContext.psForm = psForm;
	sWidgContext.mx = mx - xOrigin;
	sWidgContext.my = my - yOrigin;
	sWidgContext.xOffset = xOffset + xOrigin;
	sWidgContext.yOffset = yOffset + yOrigin;

	/* Process the form's widgets */
	WIDGET::Children const &children = formGetWidgets(psForm);
	for (WIDGET::Children::const_iterator i = children.begin(); i != children.end(); ++i)
	{
		WIDGET *psCurr = *i;

		/* Skip any hidden widgets */
		if (!psCurr->visible())
		{
			continue;
		}

		if (psCurr->type == WIDG_FORM)
		{
			/* Found a sub form, so set up the context */
			sFormContext.psForm = (W_FORM *)psCurr;
			sFormContext.mx = mx - psCurr->x - xOrigin;
			sFormContext.my = my - psCurr->y - yOrigin;
			sFormContext.xOffset = xOffset + psCurr->x + xOrigin;
			sFormContext.yOffset = yOffset + psCurr->y + yOrigin;

			/* Process it */
			widgProcessForm(&sFormContext);
		}
		else
		{
			/* Run the widget */
			psCurr->run(&sWidgContext);
		}
	}

	/* Run this form */
	psForm->run(psContext);
}

static void widgProcessClick(W_CONTEXT &psContext, WIDGET_KEY key, bool wasPressed)
{
	W_FORM *psForm = psContext.psForm;
	Vector2i origin;
	formGetOrigin(psForm, &origin.x, &origin.y);
	Vector2i pos(psContext.mx, psContext.my);
	Vector2i oPos = pos - origin;
	Vector2i offset(psContext.xOffset, psContext.yOffset);
	Vector2i oOffset = offset + origin;

	// Process subforms (but not widgets, yet).
	WIDGET::Children const &children = formGetWidgets(psForm);
	for (WIDGET::Children::const_iterator i = children.begin(); i != children.end(); ++i)
	{
		WIDGET *psCurr = *i;

		if (!psCurr->visible() || psCurr->type != WIDG_FORM)
		{
			continue;  // Skip any hidden forms or non-form widgets.
		}

		// Found a sub form, so set up the context.
		W_CONTEXT sFormContext;
		sFormContext.psScreen = psContext.psScreen;
		sFormContext.psForm = (W_FORM *)psCurr;
		sFormContext.mx = oPos.x - psCurr->x;
		sFormContext.my = oPos.y - psCurr->y;
		sFormContext.xOffset = oOffset.x + psCurr->x;
		sFormContext.yOffset = oOffset.y + psCurr->y;

		// Process it (recursively).
		widgProcessClick(sFormContext, key, wasPressed);
	}

	if (pos.x < 0 || pos.x > psForm->width || pos.y < 0 || pos.y >= psForm->height)
	{
		return;  // Click is somewhere else.
	}

	W_CONTEXT sWidgContext;
	sWidgContext.psScreen = psContext.psScreen;
	sWidgContext.psForm = psForm;
	sWidgContext.mx = oPos.x;
	sWidgContext.my = oPos.y;
	sWidgContext.xOffset = oOffset.x;
	sWidgContext.yOffset = oOffset.y;

	// Process widgets.
	WIDGET *widgetUnderMouse = NULL;
	for (WIDGET::Children::const_iterator i = children.begin(); i != children.end(); ++i)
	{
		WIDGET *psCurr = *i;

		if (!psCurr->visible())
		{
			continue;  // Skip hidden widgets.
		}

		if (oPos.x < psCurr->x || oPos.x > psCurr->x + psCurr->width || oPos.y < psCurr->y || oPos.y > psCurr->y + psCurr->height)
		{
			continue;  // The click missed the widget.
		}

		if (!psMouseOverWidget)
		{
			psMouseOverWidget = psCurr;  // Mark that the mouse is over a widget (if we haven't already).
		}

		if ((psForm->style & WFORM_CLICKABLE) != 0)
		{
			continue;  // Don't check the widgets if we are a clickable form.
		}

		widgetUnderMouse = psCurr;  // One (at least) of our widgets will get the click, so don't send it to us (we are the form).

		if (key == WKEY_NONE)
		{
			continue;  // Just checking mouse position, not a click.
		}

		if (wasPressed)
		{
			psCurr->clicked(&sWidgContext, key);
		}
		else
		{
			psCurr->released(&sWidgContext, key);
		}
	}

	// See if the mouse has moved onto or off a widget.
	if (psForm->psLastHiLite != widgetUnderMouse)
	{
		if (psForm->psLastHiLite != NULL)
		{
			psForm->psLastHiLite->highlightLost();
		}
		if (widgetUnderMouse != NULL)
		{
			widgetUnderMouse->highlight(&sWidgContext);
		}
		psForm->psLastHiLite = widgetUnderMouse;
	}

	if (widgetUnderMouse != NULL)
	{
		return;  // Only send the Clicked or Released messages if a widget didn't get the message.
	}

	if (!psMouseOverWidget)
	{
		psMouseOverWidget = psForm;  // Note that the mouse is over this form.
	}

	if (key == WKEY_NONE)
	{
		return;  // Just checking mouse position, not a click.
	}

	if (wasPressed)
	{
		psForm->clicked(&psContext, key);
	}
	else
	{
		psForm->released(&psContext, key);
	}
}


/* Execute a set of widgets for one cycle.
 * Returns a list of activated widgets.
 */
WidgetTriggers const &widgRunScreen(W_SCREEN *psScreen)
{
	psScreen->retWidgets.clear();

	/* Initialise the context */
	W_CONTEXT sContext;
	sContext.psScreen = psScreen;
	sContext.psForm = psScreen->psForm;
	sContext.xOffset = 0;
	sContext.yOffset = 0;
	psMouseOverWidget = NULL;

	// Note which keys have been pressed
	lastReleasedKey_DEPRECATED = WKEY_NONE;
	if (getWidgetsStatus())
	{
		MousePresses const &clicks = inputGetClicks();
		for (MousePresses::const_iterator c = clicks.begin(); c != clicks.end(); ++c)
		{
			WIDGET_KEY wkey;
			switch (c->key)
			{
				case MOUSE_LMB: wkey = WKEY_PRIMARY; break;
				case MOUSE_RMB: wkey = WKEY_SECONDARY; break;
				default: continue;  // Who cares about other mouse buttons?
			}
			bool pressed;
			switch (c->action)
			{
				case MousePress::Press: pressed = true; break;
				case MousePress::Release: pressed = false; break;
				default: continue;
			}
			sContext.mx = c->pos.x;
			sContext.my = c->pos.y;
			widgProcessClick(sContext, wkey, pressed);

			lastReleasedKey_DEPRECATED = wkey;
		}
	}

	sContext.mx = mouseX();
	sContext.my = mouseY();
	widgProcessClick(sContext, WKEY_NONE, true);  // Update highlights and psMouseOverWidget.

	/* Process the screen's widgets */
	widgProcessForm(&sContext);

	/* Process any user callback functions */
	widgProcessCallbacks(&sContext);

	/* Return the ID of a pressed button or finished edit box if any */
	return psScreen->retWidgets;
}


/* Set the id number for widgRunScreen to return */
void widgSetReturn(W_SCREEN *psScreen, WIDGET *psWidget)
{
	WidgetTrigger trigger;
	trigger.widget = psWidget;
	psScreen->retWidgets.push_back(trigger);
}


/* Display the widgets on a form */
static void widgDisplayForm(W_FORM *psForm, UDWORD xOffset, UDWORD yOffset)
{
	SDWORD	xOrigin = 0, yOrigin = 0;

	/* Display the form */
	psForm->display(xOffset, yOffset, psForm->aColours);
	if (psForm->disableChildren == true)
	{
		return;
	}

	/* Update the offset from the current form's position */
	formGetOrigin(psForm, &xOrigin, &yOrigin);
	xOffset += psForm->x + xOrigin;
	yOffset += psForm->y + yOrigin;

	/* If this is a clickable form, the widgets on it have to move when it's down */
	if (!(psForm->style & WFORM_NOCLICKMOVE))
	{
		if ((psForm->style & WFORM_CLICKABLE) &&
		    (((W_CLICKFORM *)psForm)->state &
		     (WCLICK_DOWN | WCLICK_LOCKED | WCLICK_CLICKLOCK)))
		{
			xOffset += 1;
			yOffset += 1;
		}
	}

	/* Display the widgets on the form */
	WIDGET::Children const &children = formGetWidgets(psForm);
	for (WIDGET::Children::const_iterator i = children.begin(); i != children.end(); ++i)
	{
		WIDGET *psCurr = *i;

		/* Skip any hidden widgets */
		if (!psCurr->visible())
		{
			continue;
		}

		if (psCurr->type == WIDG_FORM)
		{
			widgDisplayForm((W_FORM *)psCurr, xOffset, yOffset);
		}
		else
		{
			psCurr->display(xOffset, yOffset, psForm->aColours);
		}
	}
}



/* Display the screen's widgets in their current state
 * (Call after calling widgRunScreen, this allows the input
 *  processing to be seperated from the display of the widgets).
 */
void widgDisplayScreen(W_SCREEN *psScreen)
{
	/* Display the widgets */
	widgDisplayForm((W_FORM *)psScreen->psForm, 0, 0);

	/* Display the tool tip if there is one */
	tipDisplay();
}

/* Set the keyboard focus for the screen */
void screenSetFocus(W_SCREEN *psScreen, WIDGET *psWidget)
{
	screenClearFocus(psScreen);
	psScreen->psFocus = psWidget;
}


/* Clear the keyboard focus */
void screenClearFocus(W_SCREEN *psScreen)
{
	if (psScreen->psFocus != NULL)
	{
		psScreen->psFocus->focusLost(psScreen);
		psScreen->psFocus = NULL;
	}
}

void WidgSetAudio(WIDGET_AUDIOCALLBACK Callback, SWORD HilightID, SWORD ClickedID)
{
	AudioCallback = Callback;
	HilightAudioID = HilightID;
	ClickedAudioID = ClickedID;
}


WIDGET_AUDIOCALLBACK WidgGetAudioCallback(void)
{
	return AudioCallback;
}


SWORD WidgGetHilightAudioID(void)
{
	return HilightAudioID;
}


SWORD WidgGetClickedAudioID(void)
{
	return ClickedAudioID;
}


void	setWidgetsStatus(bool var)
{
	bWidgetsActive = var;
}

bool	getWidgetsStatus(void)
{
	return(bWidgetsActive);
}
