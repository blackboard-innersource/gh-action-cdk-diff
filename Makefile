BATS := ./test/test_helper/bats-core/bin/bats

.PHONY: test
test: test/test_helper/bats-core test/test_helper/bats-support test/test_helper/bats-assert
	$(BATS) test

test/test_helper/bats-core:
	git clone --quiet --depth 1 --branch v1.2.1 git@github.com:bats-core/bats-core.git $@ 2> /dev/null

test/test_helper/%:
	git clone --quiet --depth 1 git@github.com:bats-core/$*.git $@ 2> /dev/null

.PHONY: clean
clean:
	rm -rf test/test_helper