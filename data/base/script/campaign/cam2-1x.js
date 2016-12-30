/* 
SUB_2_1 Script
Author: Cristian Odorico (Alpha93)
 */
//libraries initialization
include ("script/campaign/libcampaign.js");
include ("script/campaign/templates.js");

//global variables initialization
var CAM_HUMAN_PLAYER = 0;
var downedTransportTeam = 1;
var downedTransportUnits = [];

// generate a random number between a min and max range (both ends included)
function preDamage(min, max)
{
    return Math.floor(Math.random () * (max - min + 1) + min);
}

 // function that applies damage to units in the downed transport transport team
function preDamageUnits()
{
    // fill the array with the objects defining the allied units in the crash site area
    downedTransportUnits = enumArea ("crashSite", ALLIES, false);
    // index initialization
    var j = 0; 
    for (j = 0; j < downedTransportUnits.length; j++)
    {
        // if Object type is DROID run this
        if (downedTransportUnits.type[j] === DROID)
        {
            //reduce unit HPs between 50% and 70%
            downedTransportUnits.health[j] = downedTransportUnits.health[j] * preDamage(0.3, 0.5);
        }
        // if Object type is STRUCTURE (i.e. j index points to the element containing the transport)
        if (downedTransportUnits.type[j] === STRUCTURE)
        {
            //reduce transport HPs anywhere between 30% and 50%
            downedTransportUnits.health[j] = downedTransportUnits.health[j] * preDamage(0.5, 0.7); 
        }
    }
    return downedTransportUnits;
}

//trigger event when droid reaches the downed transport
camAreaEvent("crashSite", function(droid)
{
    // initialize index variable to transfer droid
    var i = 0;
    //initialize function specific variables
    var successSound = "pcv615.ogg";
    var failureSound = "pcv622.ogg";
    var customVictoryFlag = 0;
    var remainingTime = 0;
    //transfer units
    for (i = 0; i < downedTransportUnits.length; i++)
    {
        //if index points to transport, check victory condition
        if (downedTransportUnits[i].type === STRUCTURE) 
        {
            //victory condition: transport must be alive
            if (downedTransportUnits[i].health !== NULLOBJECT)
            {
                playSound(successSound);
                customVictoryFlag = 1;
            }
            else
            {
                //if transport died, the game is over
                playSound(failureSound);
                gameOverMessage(false);
            }
        }              
    }
    i = 0;
    //store the time in the variable to give power later
    remainingTime = getMissionTime();
    //if transport is alive, transfer units, turn time into power and load next level
    if (customVictoryFlag === 1)
    {
        for(i = 0; i < downedTransportUnits.length; i++)
        {
            //transfer the units
            eventObjectTransfer (downedTransportUnits[i].me, downedTransportTeam);
        }
        //turn time into power
        extraPowerTime(remainingTime, CAM_HUMAN_PLAYER);
        //load next level
        camNextLevel("CAM_2B");
    }
});

function eventStartLevel()
{
    //variables initialization for LZ setup
    var subLandingZone = getObject("subLandingZone");
    //set landing zone
    setNoGoArea(subLandingZone.x, subLandingZone.y, subLandingZone.x2, subLandingZone.y2);
    //set alliance between player and AI downed transport team
    setAlliance(CAM_HUMAN_PLAYER, downedTransportTeam, true);
    //set downed transport team colour to be Project Green
    changePlayerColour(downedTransportTeam, 0);
    //disable reinforcements
    setReinforcementTime(-1);
};
