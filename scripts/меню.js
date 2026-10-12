function selectHunter(runtime) {
    runtime.globalVars.IsHunter = true;
    runtime.goToLayout("Макет 1");
}

function selectProp(runtime) {
    runtime.globalVars.IsHunter = false;
    runtime.goToLayout("Макет 1");
}