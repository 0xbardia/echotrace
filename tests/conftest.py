import pytest


@pytest.fixture
def echo(direct_vm, direct_deploy):
    direct_vm.check_pickling = True
    return direct_deploy("contracts/echotrace.py")
