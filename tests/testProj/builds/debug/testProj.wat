(module
	(import "std" "print_str" (func $print_str (param i32)))
	(memory (export "memory") 1)
	(data (i32.const 0) "Hello, I am in a loop!\n ")
	(func $main (export "main") (param $x i32) (result i32)
		(local $y i32)
		(block $funcleave (result i32)
		(local.set $y (i32.const 0))
		(block $block_0
		(loop $loop_1
		local.get $y
		i32.const 5
		i32.lt_s
		i32.const 1
		i32.xor
		br_if $block_0
		i32.const 0
		call $print_str
		local.get $y
		i32.const 1
		i32.add
		(local.set $y)
		br $loop_1
		)
		)
		i32.const 1
		br $funcleave
		)
	)
)