(module
	(memory (export "memory") 1)
	(data (i32.const 0) "Nice! ")
	(data (i32.const 6) "Hello, World! ")
	(func $test (param $x i32) (result i32)
		i32.const 5
		local.get $x
		i32.add
	)
	(func $nice (export "nice") (result i32)
		i32.const 0
	)
	(func $helloWorld (export "helloWorld") (result i32)
		i32.const 6
	)
	(func $main (export "main") (result i32)
		(local $x i32)
		(local.set $x (i32.const 69420))
		local.get $x
		call $test
	)
)