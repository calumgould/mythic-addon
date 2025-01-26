console.log("macro game", game)

if (!canvas) {
    console.error("Canvas not loaded.")
}

const user = game.user

// If there's an active selected token then use that as the character
const selectedToken = canvas?.tokens?.controlled[0]

console.log("user", user)
console.log("selectedToken", selectedToken)

ChatMessage.create({
    content: 'End of macro'
});